begin;
create table jht_private.auction_guard(id boolean primary key check(id));
insert into jht_private.auction_guard values(true);
alter table jht_private.auction_guard enable row level security;
revoke all on jht_private.auction_guard from public,anon,authenticated;
grant all on jht_private.auction_guard to service_role;
create table jht_private.bidders (
 id uuid primary key default gen_random_uuid(), user_id uuid unique references auth.users(id) on delete restrict,
 email text not null unique check(email=lower(email) and length(email)<=254), name text not null check(length(name) between 1 and 100),
 enabled boolean not null default true, activation_pending boolean not null default true,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table jht_private.bid_sessions (
 id_hash text primary key check(id_hash ~ '^[a-f0-9]{64}$'), bidder_id uuid not null references jht_private.bidders(id),
 encrypted_tokens text not null, expires_at timestamptz not null, last_seen timestamptz not null default now()
);
create table jht_private.auctions (
 id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 title text not null check(length(title) between 1 and 120), starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'draft' check(status in ('draft','scheduled','cancelled')), version integer not null default 1,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), check(ends_at>starts_at)
);
create table jht_private.auction_members (
 auction_id uuid references jht_private.auctions(id) on delete cascade, bidder_id uuid references jht_private.bidders(id), primary key(auction_id,bidder_id)
);
create table jht_private.auction_lots (
 id uuid primary key default gen_random_uuid(), auction_id uuid not null references jht_private.auctions(id),
 vehicle_id uuid not null references public.jht_vehicles(id) on delete restrict,
 snapshot jsonb not null, opening_amount bigint not null check(opening_amount between 1 and 10000000),
 increment bigint not null check(increment between 1 and 100000), closes_at timestamptz not null,
 highest_amount bigint, highest_bidder uuid references jht_private.bidders(id), bid_count integer not null default 0,
 confirmed_at timestamptz, confirmed_by uuid references auth.users(id), unique(auction_id,vehicle_id)
);
create table jht_private.bids (
 id uuid primary key default gen_random_uuid(), lot_id uuid not null references jht_private.auction_lots(id),
 bidder_id uuid not null references jht_private.bidders(id), amount bigint not null check(amount between 1 and 10000000),
 request_id uuid not null, created_at timestamptz not null default clock_timestamp(), unique(bidder_id,request_id)
);
create index on jht_private.bids(lot_id,created_at desc);
create index on jht_private.auction_members(bidder_id,auction_id);
create index on jht_private.auction_lots(vehicle_id);
create index on jht_private.bid_sessions(bidder_id);
-- Every table and function is server-only. No browser-role data policies.
do $$ declare t text; begin
 foreach t in array array['bidders','bid_sessions','auctions','auction_members','auction_lots','bids'] loop
 execute format('alter table jht_private.%I enable row level security',t);
 execute format('revoke all on jht_private.%I from public,anon,authenticated',t);
 execute format('grant all on jht_private.%I to service_role',t);
 end loop;
end $$;
create function public.jht_bidder_list(p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 return jsonb_build_object('bidders',coalesce((select jsonb_agg(r) from (select (to_jsonb(b)-'user_id'-'created_by')||jsonb_build_object('invite_delivered',b.user_id is not null) r from jht_private.bidders b order by created_at desc limit 200) q),'[]'::jsonb));end $$;
create function public.jht_bidder_register(p_actor uuid,p_name text,p_email text) returns jsonb language plpgsql security definer set search_path='' as $$declare r uuid;begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 select id into r from jht_private.bidders where email=p_email and user_id is null and not enabled and created_by=p_actor;
 if found then return jsonb_build_object('id',r);end if;
 if exists(select 1 from jht_private.bidders where email=p_email) then return jsonb_build_object('error','locked');end if;
 insert into jht_private.bidders(name,email,created_by,enabled) values(p_name,p_email,p_actor,false) returning id into r;
 return jsonb_build_object('id',r);end $$;
create function public.jht_bidder_attach(p_actor uuid,p_id uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) or exists(select 1 from jht_private.admin_slots where user_id=p_user) then return jsonb_build_object('error','denied');end if;
 update jht_private.bidders set user_id=p_user,enabled=true where id=p_id and user_id is null and created_by=p_actor;
 if not found then return jsonb_build_object('error','locked');end if;
 return jsonb_build_object('saved',true);end $$;
create function public.jht_bidder_activate(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 update jht_private.bidders set activation_pending=false where user_id=p_user and enabled and activation_pending;
 if not found then return jsonb_build_object('error','denied');end if;
 return jsonb_build_object('saved',true);end $$;
create function public.jht_bid_session_put(p_hash text,p_bidder uuid,p_tokens text,p_expires timestamptz) returns void
language plpgsql security definer set search_path='' as $$ begin
 if not exists(select 1 from jht_private.bidders where id=p_bidder and enabled and not activation_pending) then raise exception 'Denied';end if;
 delete from jht_private.bid_sessions where expires_at<=now() or last_seen<now()-interval '15 minutes';
 insert into jht_private.bid_sessions values(p_hash,p_bidder,p_tokens,least(p_expires,now()+interval '1 hour'),now());
end $$;
create function public.jht_bid_session_get(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare r jsonb;begin
 update jht_private.bid_sessions s set last_seen=now() where id_hash=p_hash and expires_at>now() and last_seen>now()-interval '15 minutes'
 and exists(select 1 from jht_private.bidders b where b.id=s.bidder_id and b.enabled and not b.activation_pending)
 returning to_jsonb(s) into r;return r;end $$;
create function public.jht_bid_session_drop(p_hash text) returns void language sql security definer set search_path='' as $$delete from jht_private.bid_sessions where id_hash=p_hash;$$;
create function public.jht_bidder_get(p_user uuid) returns jsonb language sql security definer set search_path='' as $$select to_jsonb(b) from jht_private.bidders b where user_id=p_user;$$;
create function public.jht_bidder_manage(p_actor uuid,p_id uuid,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 if p_enabled and not exists(select 1 from jht_private.bidders b where b.id=p_id and b.user_id is not null and not exists(select 1 from jht_private.admin_slots s where s.user_id=b.user_id)) then return jsonb_build_object('error','invalid');end if;
 update jht_private.bidders set enabled=p_enabled where id=p_id;
 if not found then return jsonb_build_object('error','missing');end if;
 if not p_enabled then delete from jht_private.bid_sessions where bidder_id=p_id;end if;
 insert into jht_private.audit(actor,action,record_id) values(p_actor,'bidder.access.update',p_id::text);
 return jsonb_build_object('saved',true);end $$;
create function public.jht_auction_save(p_actor uuid,p_id uuid,p_version integer,p_title text,p_slug text,p_start timestamptz,p_end timestamptz,p_status text,p_lots jsonb,p_members uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jht_private.auctions;v public.jht_vehicles;l jsonb;new_id uuid;begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 -- All schedules and bid acceptance take this lock first, then the lot lock. It also prevents overlapping car reservations.
 perform id from jht_private.auction_guard where id for update;
 if p_status not in ('draft','scheduled') or p_start<clock_timestamp()-interval '30 seconds' or p_end<=p_start+interval '5 minutes' or p_end>p_start+interval '7 days'
 or length(p_title) not between 1 and 120 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(p_slug)>100
 or jsonb_typeof(p_lots)<>'array' or jsonb_array_length(p_lots) not between 1 and 30 or cardinality(p_members) not between 1 and 200
 then return jsonb_build_object('error','invalid');end if;
 if (select count(distinct (item->>'vehicle_id')) from jsonb_array_elements(p_lots) item)<>jsonb_array_length(p_lots)
 or (select count(distinct x) from unnest(p_members) x)<>cardinality(p_members)
 or (select count(*) from jht_private.bidders where id=any(p_members) and enabled)<>cardinality(p_members)
 then return jsonb_build_object('error','invalid');end if;
 if p_id is not null then
 select * into a from jht_private.auctions where id=p_id for update;
 if not found then return jsonb_build_object('error','missing');end if;
 if a.version<>p_version or a.status='cancelled' or (a.status='scheduled' and a.starts_at<=clock_timestamp()) then return jsonb_build_object('error','locked');end if;
 end if;
 -- Lock vehicle rows to serialize with inventory deletion/update.
 for l in select value from jsonb_array_elements(p_lots) loop
 select * into v from public.jht_vehicles where id=(l->>'vehicle_id')::uuid for update;
 if not found or v.status<>'available' or (l->>'opening_amount')::bigint not between 1 and 10000000 or (l->>'increment')::bigint not between 1 and 100000 then return jsonb_build_object('error','invalid');end if;
 if p_status='scheduled' and exists(select 1 from jht_private.auction_lots x join jht_private.auctions s on s.id=x.auction_id
 where x.vehicle_id=v.id and s.status='scheduled' and s.id is distinct from p_id
 and (x.closes_at>clock_timestamp() or x.highest_amount is not null and x.confirmed_at is null)) then return jsonb_build_object('error','overlap');end if;
 end loop;
 if p_id is null then
 insert into jht_private.auctions(title,slug,starts_at,ends_at,status,created_by) values(p_title,p_slug,p_start,p_end,p_status,p_actor) returning id into new_id;
 else new_id:=p_id; update jht_private.auctions set title=p_title,slug=p_slug,starts_at=p_start,ends_at=p_end,status=p_status,version=version+1 where id=p_id;
 delete from jht_private.auction_members where auction_id=p_id;delete from jht_private.auction_lots where auction_id=p_id;
 end if;
 for l in select value from jsonb_array_elements(p_lots) loop
 select * into v from public.jht_vehicles where id=(l->>'vehicle_id')::uuid;
 insert into jht_private.auction_lots(auction_id,vehicle_id,snapshot,opening_amount,increment,closes_at)
 values(new_id,v.id,jsonb_build_object('brand',v.payload->>'brand','model',v.payload->>'model','year',v.payload->'year','body',v.payload->>'body','fuel',v.payload->>'fuel','transmission',v.payload->>'transmission','mileage',v.payload->'mileage','image',v.payload->>'image','gallery',v.payload->'gallery','ref',v.payload->>'ref'),(l->>'opening_amount')::bigint,(l->>'increment')::bigint,p_end);
 end loop;
 insert into jht_private.auction_members select new_id,x from unnest(p_members) x;
 insert into jht_private.audit(actor,action,record_id) values(p_actor,'auction.'||p_status,new_id::text);
 return jsonb_build_object('id',new_id);end $$;
create function public.jht_auction_control(p_actor uuid,p_id uuid,p_action text,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$declare a jht_private.auctions;l jht_private.auction_lots;begin
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 perform id from jht_private.auction_guard where id for update;
 if p_action='cancel' then
 select * into a from jht_private.auctions where id=p_id for update;
 if not found then return jsonb_build_object('error','missing');end if;
 if a.version<>p_version or a.status='cancelled' then return jsonb_build_object('error','locked');end if;
 update jht_private.auctions set status='cancelled',version=version+1 where id=p_id;
 elsif p_action='confirm' then
 select * into l from jht_private.auction_lots where id=p_id for update;
 if not found then return jsonb_build_object('error','missing');end if;
 select * into a from jht_private.auctions where id=l.auction_id;
 if a.status<>'scheduled' or l.closes_at>clock_timestamp() or l.highest_bidder is null or l.confirmed_at is not null then return jsonb_build_object('error','locked');end if;
 perform id from public.jht_vehicles where id=l.vehicle_id and status='available' for update;
 if not found then return jsonb_build_object('error','locked');end if;
 update jht_private.auction_lots set confirmed_at=clock_timestamp(),confirmed_by=p_actor where id=p_id;
 -- Inventory is reserved, not sold; payment and export are handled by the team.
 update public.jht_vehicles set status='reserved',version=version+1 where id=l.vehicle_id and status='available';
 else return jsonb_build_object('error','invalid');end if;
 insert into jht_private.audit(actor,action,record_id) values(p_actor,'auction.'||p_action,p_id::text);
 return jsonb_build_object('saved',true);end $$;
create function public.jht_place_bid(p_bidder uuid,p_lot uuid,p_amount bigint,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jht_private.auctions;l jht_private.auction_lots;old jht_private.bids;t timestamptz;next_amount bigint;begin
 perform id from jht_private.auction_guard where id for update;
 select * into l from jht_private.auction_lots where id=p_lot for update;
 if not found then return jsonb_build_object('error','missing');end if;
 select * into a from jht_private.auctions where id=l.auction_id for share;
 if not exists(select 1 from jht_private.bidders where id=p_bidder and enabled and not activation_pending)
 or not exists(select 1 from jht_private.auction_members where auction_id=a.id and bidder_id=p_bidder)
 or a.status='draft' then return jsonb_build_object('error','denied');end if;
 select * into old from jht_private.bids where bidder_id=p_bidder and request_id=p_request;
 if found then
 if old.lot_id<>p_lot or old.amount<>p_amount then return jsonb_build_object('error','replay');end if;
 return jsonb_build_object('accepted',true,'bid_id',old.id,'amount',old.amount,'replayed',true);end if;
 t:=clock_timestamp();
 if a.status<>'scheduled' or t<a.starts_at or t>=l.closes_at then return jsonb_build_object('error','closed');end if;
 if not exists(select 1 from public.jht_vehicles where id=l.vehicle_id and status='available') then return jsonb_build_object('error','closed');end if;
 if l.highest_bidder=p_bidder then return jsonb_build_object('error','leading');end if;
 next_amount:=coalesce(l.highest_amount+l.increment,l.opening_amount);
 if p_amount<next_amount or p_amount>10000000 or p_amount<>trunc(p_amount) then return jsonb_build_object('error','low','minimum',next_amount);end if;
 if l.closes_at-t<=interval '2 minutes' then l.closes_at:=greatest(l.closes_at,t+interval '3 minutes');end if;
 insert into jht_private.bids(lot_id,bidder_id,amount,request_id,created_at) values(p_lot,p_bidder,p_amount,p_request,t) returning * into old;
 update jht_private.auction_lots set highest_amount=p_amount,highest_bidder=p_bidder,bid_count=bid_count+1,closes_at=l.closes_at where id=p_lot;
 insert into jht_private.audit(actor,action,record_id) select user_id,'bid.accepted',old.id::text from jht_private.bidders where id=p_bidder;
 return jsonb_build_object('accepted',true,'bid_id',old.id,'amount',p_amount,'closes_at',l.closes_at);end $$;
create function public.jht_auction_list(p_actor uuid,p_admin boolean) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if p_admin then
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 else
 if not exists(select 1 from jht_private.bidders where id=p_actor and enabled and not activation_pending) then return jsonb_build_object('error','denied');end if;
 end if;
 return jsonb_build_object('server_now',clock_timestamp(),'sessions',coalesce((select jsonb_agg(r order by r->>'starts_at' desc) from
 (select jsonb_build_object('id',a.id,'slug',a.slug,'title',a.title,'starts_at',a.starts_at,'ends_at',greatest(a.ends_at,coalesce((select max(closes_at) from jht_private.auction_lots where auction_id=a.id),a.ends_at)), 'status',a.status,'version',a.version,'lot_count',(select count(*) from jht_private.auction_lots where auction_id=a.id),'bid_count',(select coalesce(sum(bid_count),0) from jht_private.auction_lots where auction_id=a.id)) r
 from jht_private.auctions a where p_admin or a.status<>'draft' and exists(select 1 from jht_private.auction_members m where m.auction_id=a.id and m.bidder_id=p_actor) order by a.created_at desc limit 100) q),'[]'::jsonb));end $$;
create function public.jht_auction_room(p_actor uuid,p_admin boolean,p_slug text) returns jsonb
language plpgsql security definer set search_path='' as $$declare a jht_private.auctions;lots jsonb;members jsonb;begin
 select * into a from jht_private.auctions where slug=p_slug;
 if not found then return jsonb_build_object('error','missing');end if;
 if p_admin then
 if not exists(select 1 from jht_private.admin_slots where user_id=p_actor and enabled) then return jsonb_build_object('error','denied');end if;
 else
 if a.status='draft' or not exists(select 1 from jht_private.bidders where id=p_actor and enabled and not activation_pending)
 or not exists(select 1 from jht_private.auction_members where auction_id=a.id and bidder_id=p_actor) then return jsonb_build_object('error','missing');end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'vehicle_id',l.vehicle_id,'vehicle',l.snapshot,'opening_amount',l.opening_amount,'increment',l.increment,'highest_amount',l.highest_amount,'next_bid',coalesce(l.highest_amount+l.increment,l.opening_amount),'closes_at',l.closes_at,'bid_count',l.bid_count,'leading',l.highest_bidder=p_actor,'confirmed',l.confirmed_at is not null,
 'my_bid',(select max(amount) from jht_private.bids where lot_id=l.id and bidder_id=p_actor),
 'leader',case when p_admin then (select jsonb_build_object('name',b.name,'email',b.email) from jht_private.bidders b where b.id=l.highest_bidder) else null end,
 'history',coalesce((select jsonb_agg(h) from (select jsonb_build_object('amount',b.amount,'created_at',b.created_at,'mine',b.bidder_id=p_actor,'name',case when p_admin then (select name from jht_private.bidders where id=b.bidder_id) else null end) h from jht_private.bids b where lot_id=l.id order by b.created_at desc limit 10) q),'[]'::jsonb)) order by l.id),'[]'::jsonb) into lots from jht_private.auction_lots l where auction_id=a.id;
 select coalesce(jsonb_agg(bidder_id),'[]'::jsonb) into members from jht_private.auction_members where auction_id=a.id;
 return jsonb_build_object('server_now',clock_timestamp(),'session',to_jsonb(a)-'created_by','lots',lots,'members',case when p_admin then members else '[]'::jsonb end);end $$;
create function public.jht_bid_media(p_bidder uuid,p_media uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from jht_private.auction_lots l join jht_private.auctions a on a.id=l.auction_id join jht_private.auction_members m on m.auction_id=a.id join jht_private.bidders b on b.id=m.bidder_id
 where b.id=p_bidder and b.enabled and not b.activation_pending and a.status<>'draft' and (l.snapshot->>'image'='api/media/'||p_media::text||'.webp' or coalesce(l.snapshot->'gallery','[]'::jsonb)?('api/media/'||p_media::text||'.webp')));
$$;
-- A scheduled car cannot be sold/hidden while bids are possible. Cancel its session first.
create function jht_private.guard_auction_vehicle() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status<>'available' and exists(select 1 from jht_private.auction_lots l join jht_private.auctions a on a.id=l.auction_id where l.vehicle_id=old.id and a.status='scheduled' and l.closes_at>clock_timestamp()) then
 raise exception 'Cancel the active bidding session before changing this car status' using errcode='23514';end if;
 return new;end $$;
revoke all on function jht_private.guard_auction_vehicle() from public,anon,authenticated;
create trigger jht_vehicle_auction_status before update of status on public.jht_vehicles for each row execute function jht_private.guard_auction_vehicle();
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and (p.proname like 'jht_bid%' or p.proname like 'jht_auction%' or p.proname='jht_place_bid') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;
commit;
