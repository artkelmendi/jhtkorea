begin;
alter table public.jht_homepage add column arrival_ids uuid[] not null default '{}';
create table public.jht_media (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.jht_media enable row level security;
revoke all on public.jht_media from public,anon,authenticated;
grant all on public.jht_media to service_role;
create table public.jht_notices (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 title text not null check(length(title) between 1 and 160),
 content text not null check(length(content) between 1 and 15000),
 status text not null check(status in ('draft','published')),
 version integer not null default 1,
 created_at timestamptz not null default now()
);
alter table public.jht_notices enable row level security;
revoke all on public.jht_notices from public,anon,authenticated;
grant all on public.jht_notices to service_role;
-- Objects remain private. No browser storage policy or signed public upload path.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('jht-vehicle-photos','jht-vehicle-photos',false,2097152,array['image/webp'])
on conflict(id) do nothing;
-- A reference is publishable only if it is one of the existing bundled assets or a processed upload.
create function public.jht_media_referenced(p_id uuid,p_public boolean) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from public.jht_vehicles v
 where (not p_public or v.status in ('available','reserved'))
 and (v.payload->>'image'='api/media/'||p_id::text||'.webp'
 or coalesce(v.payload->'gallery','[]'::jsonb) ? ('api/media/'||p_id::text||'.webp')));
$$;
revoke all on function public.jht_media_referenced(uuid,boolean) from public,anon,authenticated;
grant execute on function public.jht_media_referenced(uuid,boolean) to service_role;
commit;
