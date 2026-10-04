begin;
create schema if not exists jht_private;
revoke all on schema jht_private from public, anon, authenticated;
grant usage on schema jht_private to service_role;

create table jht_private.admin_slots (
  slot smallint primary key check (slot in (1,2)),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  allow_enrollment boolean not null default true
);
create table jht_private.sessions (
  id_hash text primary key check (id_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_tokens text not null,
  expires_at timestamptz not null,
  last_seen timestamptz not null default now()
);
create index on jht_private.sessions(user_id);
create table jht_private.rate_limits (
  key_hash text primary key,
  started_at timestamptz not null,
  attempts integer not null check (attempts > 0)
);
create table jht_private.audit (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  record_id text,
  created_at timestamptz not null default now()
);
create table public.jht_vehicles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null check (status in ('available','reserved','sold','draft','archived')),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create table public.jht_homepage (
  singleton boolean primary key default true check(singleton),
  featured_id uuid references public.jht_vehicles(id) on delete set null,
  show_price boolean not null default true,
  show_label boolean not null default true,
  arrival_order text not null default 'automatic' check(arrival_order in ('automatic','manual'))
);
insert into public.jht_homepage(singleton) values(true);

alter table public.jht_vehicles enable row level security;
alter table public.jht_homepage enable row level security;
-- Deliberately no browser-role policies. Only the verified server API accesses these tables.
revoke all on public.jht_vehicles, public.jht_homepage from public, anon, authenticated;
grant all on public.jht_vehicles, public.jht_homepage to service_role;
alter table jht_private.admin_slots enable row level security;
alter table jht_private.sessions enable row level security;
alter table jht_private.rate_limits enable row level security;
alter table jht_private.audit enable row level security;
grant all on all tables in schema jht_private to service_role;
grant usage, select on all sequences in schema jht_private to service_role;

create function public.jht_admin_slot(p_user uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select to_jsonb(s) from jht_private.admin_slots s where s.user_id=p_user;
$$;
create function public.jht_session_put(p_hash text,p_user uuid,p_tokens text,p_expires timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from jht_private.admin_slots where user_id=p_user) then raise exception 'Denied'; end if;
  delete from jht_private.sessions where expires_at <= now() or last_seen < now()-interval '15 minutes';
  insert into jht_private.sessions(id_hash,user_id,encrypted_tokens,expires_at) values(p_hash,p_user,p_tokens,least(p_expires,now()+interval '1 hour'));
end;
$$;
create function public.jht_session_get(p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  update jht_private.sessions set last_seen=now()
    where id_hash=p_hash and expires_at>now() and last_seen>now()-interval '15 minutes'
    returning jsonb_build_object('user_id',user_id,'encrypted_tokens',encrypted_tokens,'expires_at',expires_at) into result;
  return result;
end;
$$;
create function public.jht_session_drop(p_hash text) returns void
language sql security definer set search_path = '' as $$ delete from jht_private.sessions where id_hash=p_hash; $$;
create function public.jht_revoke_user_sessions(p_user uuid) returns void
language sql security definer set search_path = '' as $$ delete from jht_private.sessions where user_id=p_user; $$;
create function public.jht_rate_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_limit<1 or p_seconds<1 or p_key !~ '^[a-f0-9]{64}$' then raise exception 'Denied'; end if;
  delete from jht_private.rate_limits where started_at < now()-interval '1 day';
  insert into jht_private.rate_limits(key_hash,started_at,attempts) values(p_key,now(),1)
    on conflict(key_hash) do update set
      attempts=case when jht_private.rate_limits.started_at < now()-make_interval(secs=>p_seconds) then 1 else jht_private.rate_limits.attempts+1 end,
      started_at=case when jht_private.rate_limits.started_at < now()-make_interval(secs=>p_seconds) then now() else jht_private.rate_limits.started_at end
    returning attempts into n;
  return n<=p_limit;
end;
$$;
create function public.jht_audit(p_actor uuid,p_action text,p_record text) returns void
language sql security definer set search_path = '' as $$
  insert into jht_private.audit(actor,action,record_id) values(p_actor,left(p_action,80),left(p_record,120));
$$;
do $$ declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname like 'jht_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
commit;
