begin;
create table public.jht_site_settings (
 singleton boolean primary key default true check(singleton),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now()
);
alter table public.jht_site_settings enable row level security;
revoke all on public.jht_site_settings from public,anon,authenticated;
grant all on public.jht_site_settings to service_role;
insert into public.jht_site_settings(singleton,payload) values(true,$settings${
 "phone":"+82 10 3656 3439","email":"carkorea01@gmail.com",
 "address":"469, Aam-daero, Yeonsu-gu, Incheon, Republic of Korea",
 "hours":"Visits by appointment. Contact us before travelling.",
 "announcement":{"enabled":false,"text":"","startsAt":null,"endsAt":null},
 "faq":[
 {"group":"Finding a car","question":"Can you find a vehicle that is not listed?","answer":"Yes. Tell us the make, model, year and features you want. We can search beyond the cars listed on this website and discuss suitable options with you."},
 {"group":"Finding a car","question":"Which makes and vehicle types do you handle?","answer":"We source Korean and imported makes, including sedans, SUVs, vans and other body styles. Ask our team about your preferred vehicle and current availability."},
 {"group":"Finding a car","question":"Can I review a car's condition before deciding?","answer":"Ask for the available photos, inspection information and vehicle details before making a decision. Our team will explain what is known and what needs to be confirmed."},
 {"group":"Buying & payment","question":"How do I reserve a vehicle?","answer":"Contact our team with the vehicle reference. We will confirm availability and explain the reservation terms before you proceed."},
 {"group":"Buying & payment","question":"How is payment arranged?","answer":"Our team confirms the invoice and payment instructions directly with you. Verify those details with JHT Korea before sending a payment."},
 {"group":"Buying & payment","question":"Is shipping included in the vehicle price?","answer":"Listed vehicle prices are in USD. Shipping and other destination costs are quoted separately unless our team explicitly confirms otherwise."},
 {"group":"Shipping & arrival","question":"What is the difference between RoRo and container shipping?","answer":"RoRo transports vehicles on a dedicated vehicle carrier. Container shipping places the vehicle inside a container. The suitable option depends on the vehicle, route and availability."},
 {"group":"Shipping & arrival","question":"How long does shipping take?","answer":"Timing depends on the destination, vessel schedule and port arrangements. Ask our team for the current estimate for your route."},
 {"group":"Shipping & arrival","question":"How can I follow the shipment?","answer":"Our team can share the available shipment information and explain how to follow your vehicle's journey once transport is arranged."},
 {"group":"Shipping & arrival","question":"Which documents will I need?","answer":"The documents depend on your destination's import requirements. Confirm those requirements with your local authorities and ask JHT Korea about the export documents supplied with the vehicle."}
 ]
}$settings$::jsonb);

alter table jht_private.audit add column record_label text;
-- Capture a human-readable label before deletion; do not store contact details or tokens.
create or replace function public.jht_audit(p_actor uuid,p_action text,p_record text) returns void
language plpgsql security definer set search_path='' as $$
declare label text;
begin
 select concat_ws(' ',v.payload->>'brand',v.payload->>'model')||' · '||(v.payload->>'ref') into label from public.jht_vehicles v where v.id::text=p_record;
 if label is null then select n.title into label from public.jht_notices n where n.id::text=p_record; end if;
 if label is null then select a.record_label into label from jht_private.audit a where a.record_id=p_record and a.actor=p_actor and a.record_label is not null order by a.id desc limit 1; end if;
 insert into jht_private.audit(actor,action,record_id,record_label) values(p_actor,left(p_action,80),left(p_record,120),left(label,200));
end $$;

create function public.jht_site_save(p_actor uuid,p_version integer,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.jht_site_settings;
begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then raise insufficient_privilege; end if;
 update public.jht_site_settings set payload=p_payload,version=version+1,updated_at=now() where singleton and version=p_version returning * into saved;
 if saved is null then return null; end if;
 insert into jht_private.audit(actor,action,record_id,record_label) values(p_actor,'site.update.success','site','Website contact details, FAQs and announcement');
 return to_jsonb(saved);
end $$;

create function public.jht_stock_export(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare records jsonb;
begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then raise insufficient_privilege; end if;
 select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) into records from (select * from public.jht_vehicles order by created_at,id limit 5001) v;
 if jsonb_array_length(records)>5000 then return '{"tooMany":true}'::jsonb; end if;
 insert into jht_private.audit(actor,action,record_id,record_label) values(p_actor,'stock.export.success','inventory','Stock CSV');
 return jsonb_build_object('rows',records);
end $$;

create function public.jht_activity_feed(p_before bigint,p_category text) returns jsonb
language sql security definer set search_path='' as $$
 with page as (
  select a.id,a.action,a.created_at,
   case when s.slot is not null then 'Administrator '||s.slot::text when a.action='bid.accepted' then 'Invited member' else 'System' end actor,
   coalesce(a.record_label,concat_ws(' ',v.payload->>'brand',v.payload->>'model')||nullif(' · '||coalesce(v.payload->>'ref',''),' · '),n.title,b.payload->>'brand'||' '||(b.payload->>'model'),e.title,
     case when a.action like 'homepage.%' then 'Homepage selection' when a.action like 'photo.%' then 'Vehicle photo' when a.action like 'bidder.%' then 'Invited member access' else 'Removed record' end) record
  from jht_private.audit a
  left join jht_private.admin_slots s on s.user_id=a.actor
  left join public.jht_vehicles v on v.id::text=a.record_id
  left join public.jht_notices n on n.id::text=a.record_id
  left join jht_private.bid_vehicles b on b.id::text=a.record_id
  left join jht_private.auctions e on e.id::text=a.record_id
  where (p_before is null or a.id<p_before) and a.action not like '%.attempt'
   and (p_category='all' or p_category='inventory' and (a.action like 'vehicle.%' or a.action like 'stock.%' or a.action like 'photo.%')
    or p_category='website' and (a.action like 'site.%' or a.action like 'notice.%' or a.action like 'homepage.%')
    or p_category='bidding' and (a.action like 'auction.%' or a.action like 'bid.%' or a.action like 'bidder.%'))
  order by a.id desc limit 51
 ), shown as (select * from page order by id desc limit 50)
 select jsonb_build_object('events',coalesce((select jsonb_agg(jsonb_build_object('id',id::text,'action',action,'at',created_at,'actor',actor,'record',record) order by id desc) from shown),'[]'::jsonb),
  'nextCursor',case when (select count(*) from page)>50 then (select min(id)::text from shown) else null end);
$$;
revoke all on function public.jht_site_save(uuid,integer,jsonb),public.jht_stock_export(uuid),public.jht_activity_feed(bigint,text) from public,anon,authenticated;
grant execute on function public.jht_site_save(uuid,integer,jsonb),public.jht_stock_export(uuid),public.jht_activity_feed(bigint,text) to service_role;
commit;
