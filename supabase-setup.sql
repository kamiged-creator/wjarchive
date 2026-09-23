-- 새 구매자 프로젝트 전용. 기존 운영 프로젝트에서 실행하지 마세요.
-- 1. Supabase Auth에서 관리자 계정을 만든 뒤 auth.users의 id를 확인합니다.
-- 2. 아래 UUID를 실제 관리자 user id로 바꾼 뒤 전체 SQL을 실행합니다.
--    REPLACE_WITH_ADMIN_USER_UUID

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  category text not null default '기타',
  year_text text not null default '',
  medium text not null default '',
  description text not null default '',
  image_url text not null default '',
  large_image_url text not null default '',
  youtube_url text not null default '',
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  sort_order integer not null default 0,
  is_visible boolean not null default true
);

create table if not exists public.exhibitions (like public.news_items including all);
create table if not exists public.contact_items (like public.news_items including all);

alter table public.site_settings enable row level security;
alter table public.works enable row level security;
alter table public.news_items enable row level security;
alter table public.exhibitions enable row level security;
alter table public.contact_items enable row level security;

-- 기존 기본 GRANT 상태에 의존하지 않도록 명시합니다.
grant usage on schema public to anon, authenticated;
grant select on public.site_settings, public.works,
  public.news_items, public.exhibitions, public.contact_items to anon;
grant select, insert, update, delete on public.site_settings, public.works,
  public.news_items, public.exhibitions, public.contact_items to authenticated;

-- 공개 사이트는 공개 설정과 표시 중인 콘텐츠만 읽습니다.
create policy "Public reads site settings" on public.site_settings
  for select to anon using (true);
create policy "Public reads visible works" on public.works
  for select to anon using (is_visible);
create policy "Public reads visible news" on public.news_items
  for select to anon using (is_visible);
create policy "Public reads visible exhibitions" on public.exhibitions
  for select to anon using (is_visible);
create policy "Public reads visible contact" on public.contact_items
  for select to anon using (is_visible);

-- 관리자 계정 하나에만 쓰기를 허용합니다. UUID를 교체하지 않으면 실행되지 않습니다.
do $$
declare
  admin_id uuid := 'REPLACE_WITH_ADMIN_USER_UUID'::uuid;
  table_name text;
begin
  foreach table_name in array array['site_settings','works','news_items','exhibitions','contact_items'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select auth.uid()) = %L::uuid) with check ((select auth.uid()) = %L::uuid)',
      'Admin manages ' || table_name, table_name, admin_id, admin_id
    );
  end loop;
end $$;
