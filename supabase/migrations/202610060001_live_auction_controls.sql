begin;
alter table jht_private.auctions add column start_notice text not null default '' check(length(start_notice)<=240);
alter table jht_private.auction_lots add column manually_closed_at timestamptz;
alter table jht_private.auction_lots add column manually_closed_by uuid references auth.users(id);
create table jht_private.auction_events (
 seq bigint generated always as identity primary key,
 auction_id uuid not null references jht_private.auctions(id),
 lot_id uuid references jht_private.auction_lots(id) on delete set null,
 bid_id uuid references jht_private.bids(id),
 kind text not null check(kind in ('bid','start','notice','close','confirm','cancel')),
 created_at timestamptz not null default clock_timestamp()
);
alter table jht_private.auction_events enable row level security;
revoke all on jht_private.auction_events from public,anon,authenticated;
grant all on jht_private.auction_events to service_role;
grant usage,select on sequence jht_private.auction_events_seq_seq to service_role;
create index on jht_private.auction_events(auction_id,seq);
insert into jht_private.auction_events(auction_id,lot_id,bid_id,kind,created_at) select l.auction_id,b.lot_id,b.id,'bid',b.created_at from jht_private.bids b join jht_private.auction_lots l on l.id=b.lot_id order by b.created_at,b.id;

create function jht_private.capture_auction_event() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_table_name='bids' then
  insert into jht_private.auction_events(auction_id,lot_id,bid_id,kind)
   select auction_id,new.lot_id,new.id,'bid' from jht_private.auction_lots where id=new.lot_id;
 elsif tg_table_name='auction_lots' then
  if old.confirmed_at is null and new.confirmed_at is not null then insert into jht_private.auction_events(auction_id,lot_id,kind) values(new.auction_id,new.id,'confirm');end if;
 elsif tg_table_name='auctions' then
  if old.status<>'cancelled' and new.status='cancelled' then insert into jht_private.auction_events(auction_id,kind) values(new.id,'cancel');end if;
 end if;
 return new; end $$;
revoke all on function jht_private.capture_auction_event() from public,anon,authenticated;
create trigger jht_bid_event after insert on jht_private.bids for each row execute function jht_private.capture_auction_event();
create trigger jht_confirmation_event after update of confirmed_at on jht_private.auction_lots for each row execute function jht_private.capture_auction_event();
create trigger jht_cancel_event after update of status on jht_private.auctions for each row execute function jht_private.capture_auction_event();
create function jht_private.notify_auction_event() returns trigger language plpgsql security definer set search_path='' as $$ begin
 perform pg_notify('jht_auction_changed',new.seq::text);return new;end $$;
revoke all on function jht_private.notify_auction_event() from public,anon,authenticated;
create trigger jht_event_notification after insert on jht_private.auction_events for each row execute function jht_private.notify_auction_event();
-- Only the server service role can subscribe. Local preview uses PostgreSQL NOTIFY.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table jht_private.auction_events;
 end if;
end $$;

create function public.jht_auction_start(p_actor uuid,p_id uuid,p_version integer,p_notice_minutes integer,p_notice text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jht_private.auctions;t timestamptz;duration interval;begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 perform id from jht_private.auction_guard where id for update;
 select * into a from jht_private.auctions where id=p_id for update;
 if not found then return jsonb_build_object('error','missing');end if;
 t:=clock_timestamp();
 if a.version<>p_version or a.status='cancelled' or a.status='scheduled' and a.starts_at<=t
  or exists(select 1 from jht_private.auction_lots where auction_id=p_id and (bid_count>0 or confirmed_at is not null or manually_closed_at is not null)) then return jsonb_build_object('error','locked');end if;
 if p_notice_minutes is null or p_notice_minutes not between 0 and 1440 or p_notice is null or length(p_notice)>240
  or p_notice_minutes>0 and length(trim(p_notice))=0 then return jsonb_build_object('error','invalid');end if;
 if not exists(select 1 from jht_private.auction_members m join jht_private.bidders b on b.id=m.bidder_id where m.auction_id=p_id and b.enabled and not b.activation_pending)
  or not exists(select 1 from jht_private.auction_lots where auction_id=p_id)
  or exists(select 1 from jht_private.auction_lots l join jht_private.bid_vehicles v on v.id=l.vehicle_id where l.auction_id=p_id and v.status<>'available') then return jsonb_build_object('error','invalid');end if;
 if exists(select 1 from jht_private.auction_lots l join jht_private.auction_lots x on x.vehicle_id=l.vehicle_id and x.auction_id<>p_id
  join jht_private.auctions s on s.id=x.auction_id where l.auction_id=p_id and s.status='scheduled'
  and (x.closes_at>t or x.highest_amount is not null and x.confirmed_at is null)) then return jsonb_build_object('error','overlap');end if;
 duration:=a.ends_at-a.starts_at;
 update jht_private.auctions set status='scheduled',starts_at=t+make_interval(mins=>p_notice_minutes),ends_at=t+make_interval(mins=>p_notice_minutes)+duration,
  start_notice=case when p_notice_minutes>0 then trim(p_notice) else '' end,version=version+1 where id=p_id;
 update jht_private.auction_lots set closes_at=t+make_interval(mins=>p_notice_minutes)+duration where auction_id=p_id;
 insert into jht_private.auction_events(auction_id,kind) values(p_id,case when p_notice_minutes=0 then 'start' else 'notice' end);
 insert into jht_private.audit(actor,action,record_id) values(p_actor,case when p_notice_minutes=0 then 'auction.start' else 'auction.notice' end,p_id::text);
 return jsonb_build_object('saved',true);end $$;

create function public.jht_auction_close_lot(p_actor uuid,p_lot uuid,p_expected bigint) returns jsonb
language plpgsql security definer set search_path='' as $$declare a jht_private.auctions;l jht_private.auction_lots;t timestamptz;begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 perform id from jht_private.auction_guard where id for update;
 select * into l from jht_private.auction_lots where id=p_lot for update;
 if not found then return jsonb_build_object('error','missing');end if;
 select * into a from jht_private.auctions where id=l.auction_id for share;t:=clock_timestamp();
 if a.status<>'scheduled' or t<a.starts_at or t>=l.closes_at or l.confirmed_at is not null or l.highest_bidder is null then return jsonb_build_object('error','closed');end if;
 if l.highest_amount is distinct from p_expected then return jsonb_build_object('error','price_changed');end if;
 update jht_private.auction_lots set closes_at=t,manually_closed_at=t,manually_closed_by=p_actor where id=p_lot;
 insert into jht_private.auction_events(auction_id,lot_id,kind) values(l.auction_id,l.id,'close');
 insert into jht_private.audit(actor,action,record_id,record_label) values(p_actor,'auction.close',l.id::text,concat_ws(' ',l.snapshot->>'brand',l.snapshot->>'model'));
 return jsonb_build_object('saved',true,'highest_amount',l.highest_amount);end $$;

create function public.jht_auction_live(p_actor uuid,p_after bigint) returns jsonb
language plpgsql security definer set search_path='' as $$declare items jsonb;events jsonb;latest bigint;more boolean;begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'session_id',a.id,'session_slug',a.slug,'session_title',a.title,'starts_at',a.starts_at,'closes_at',l.closes_at,
  'vehicle',jsonb_build_object('brand',l.snapshot->>'brand','model',l.snapshot->>'model','year',l.snapshot->'year','ref',l.snapshot->>'ref','image',l.snapshot->>'image'),
  'highest_amount',l.highest_amount,'next_bid',coalesce(l.highest_amount+l.increment,l.opening_amount),'bid_count',l.bid_count,
  'leader',(select name from jht_private.bidders where id=l.highest_bidder),'confirmed',l.confirmed_at is not null,'closed_early',l.manually_closed_at is not null) order by l.closes_at),'[]'::jsonb)
 into items from jht_private.auction_lots l join jht_private.auctions a on a.id=l.auction_id
 where a.status='scheduled' and (l.closes_at>clock_timestamp() or l.highest_amount is not null and l.confirmed_at is null);
 with selected as (
  select * from jht_private.auction_events where p_after is null or seq>p_after
  order by case when p_after is null then seq end desc,seq asc limit 51
 ), shown as (select * from selected order by case when p_after is null then seq end desc,seq asc limit 50)
 select coalesce(jsonb_agg(jsonb_build_object('seq',e.seq::text,'kind',e.kind,'at',e.created_at,'session_title',a.title,'session_slug',a.slug,
  'lot_id',e.lot_id,'car',concat_ws(' ',l.snapshot->>'brand',l.snapshot->>'model'),'ref',l.snapshot->>'ref','amount',b.amount,'bidder',m.name) order by e.seq desc),'[]'::jsonb),
  coalesce(max(e.seq),p_after,0),(select count(*)>50 from selected) and p_after is not null
 into events,latest,more from shown e join jht_private.auctions a on a.id=e.auction_id left join jht_private.auction_lots l on l.id=e.lot_id
 left join jht_private.bids b on b.id=e.bid_id left join jht_private.bidders m on m.id=b.bidder_id;
 return jsonb_build_object('server_now',clock_timestamp(),'lots',items,'events',events,'cursor',latest::text,'more',more);end $$;

revoke all on function public.jht_auction_start(uuid,uuid,integer,integer,text),public.jht_auction_close_lot(uuid,uuid,bigint),public.jht_auction_live(uuid,bigint) from public,anon,authenticated;
grant execute on function public.jht_auction_start(uuid,uuid,integer,integer,text),public.jht_auction_close_lot(uuid,uuid,bigint),public.jht_auction_live(uuid,bigint) to service_role;
create or replace function public.jht_auction_room(p_actor uuid,p_admin boolean,p_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$declare a jht_private.auctions;lots jsonb;members jsonb;begin
 select * into a from jht_private.auctions where slug=p_slug;
 if not found then return jsonb_build_object('error','missing');end if;
 if p_admin then
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 else
 if a.status='draft' or not exists(select 1 from jht_private.bidders where id=p_actor and enabled and not activation_pending)
 or not exists(select 1 from jht_private.auction_members where auction_id=a.id and bidder_id=p_actor) then return jsonb_build_object('error','missing');end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'vehicle_id',l.vehicle_id,'vehicle',l.snapshot,'opening_amount',l.opening_amount,'increment',l.increment,'highest_amount',l.highest_amount,'next_bid',coalesce(l.highest_amount+l.increment,l.opening_amount),'closes_at',l.closes_at,'bid_count',l.bid_count,'leading',l.highest_bidder=p_actor,'confirmed',l.confirmed_at is not null,'closed_early',l.manually_closed_at is not null,
 'my_bid',(select max(amount) from jht_private.bids where lot_id=l.id and bidder_id=p_actor),
 'leader',case when p_admin then (select jsonb_build_object('name',b.name) from jht_private.bidders b where b.id=l.highest_bidder) else null end,
 'history',coalesce((select jsonb_agg(h) from (select jsonb_build_object('amount',b.amount,'created_at',b.created_at,'mine',b.bidder_id=p_actor,'name',case when p_admin then (select name from jht_private.bidders where id=b.bidder_id) else null end) h from jht_private.bids b where lot_id=l.id order by b.created_at desc limit 10) q),'[]'::jsonb)) order by l.id),'[]'::jsonb) into lots from jht_private.auction_lots l where auction_id=a.id;
 select coalesce(jsonb_agg(bidder_id),'[]'::jsonb) into members from jht_private.auction_members where auction_id=a.id;
 return jsonb_build_object('server_now',clock_timestamp(),'session',(to_jsonb(a)-'created_by')||jsonb_build_object('ends_at',coalesce((select max(closes_at) from jht_private.auction_lots where auction_id=a.id),a.ends_at)),'lots',lots,'members',case when p_admin then members else '[]'::jsonb end);end $$;

create or replace function public.jht_auction_control(p_actor uuid,p_id uuid,p_action text,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$declare a jht_private.auctions;l jht_private.auction_lots;begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 perform id from jht_private.auction_guard where id for update;
 if p_action='cancel' then
 select * into a from jht_private.auctions where id=p_id for update;
 if not found then return jsonb_build_object('error','missing');end if;
 if a.version<>p_version or a.status='cancelled' then return jsonb_build_object('error','locked');end if;
 if exists(select 1 from jht_private.auction_lots where auction_id=p_id and confirmed_at is not null) then return jsonb_build_object('error','confirmed');end if;
 update jht_private.auctions set status='cancelled',version=version+1 where id=p_id;
 elsif p_action='confirm' then
 select * into l from jht_private.auction_lots where id=p_id for update;
 if not found then return jsonb_build_object('error','missing');end if;
 select * into a from jht_private.auctions where id=l.auction_id;
 if a.status<>'scheduled' or l.closes_at>clock_timestamp() or l.highest_bidder is null or l.confirmed_at is not null then return jsonb_build_object('error','locked');end if;
 perform id from jht_private.bid_vehicles where id=l.vehicle_id and status='available' for update;
 if not found then return jsonb_build_object('error','locked');end if;
 update jht_private.auction_lots set confirmed_at=clock_timestamp(),confirmed_by=p_actor where id=p_id;
 -- Inventory is reserved, not sold; payment and export are handled by the team.
 update jht_private.bid_vehicles set status='reserved',version=version+1 where id=l.vehicle_id and status='available';
 else return jsonb_build_object('error','invalid');end if;
 insert into jht_private.audit(actor,action,record_id) values(p_actor,'auction.'||p_action,p_id::text);
 return jsonb_build_object('saved',true);end $$;

create or replace function public.jht_auction_list(p_actor uuid,p_admin boolean) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if p_admin then
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 else
 if not exists(select 1 from jht_private.bidders where id=p_actor and enabled and not activation_pending) then return jsonb_build_object('error','denied');end if;
 end if;
 return jsonb_build_object('server_now',clock_timestamp(),'sessions',coalesce((select jsonb_agg(r order by r->>'starts_at' desc) from
 (select jsonb_build_object('id',a.id,'slug',a.slug,'title',a.title,'starts_at',a.starts_at,'ends_at',coalesce((select max(closes_at) from jht_private.auction_lots where auction_id=a.id),a.ends_at), 'status',a.status,'version',a.version,'has_confirmed',exists(select 1 from jht_private.auction_lots where auction_id=a.id and confirmed_at is not null),'lot_count',(select count(*) from jht_private.auction_lots where auction_id=a.id),'bid_count',(select coalesce(sum(bid_count),0) from jht_private.auction_lots where auction_id=a.id)) r
 from jht_private.auctions a where p_admin or a.status<>'draft' and exists(select 1 from jht_private.auction_members m where m.auction_id=a.id and m.bidder_id=p_actor) order by a.created_at desc limit 100) q),'[]'::jsonb));end $$;

commit;
