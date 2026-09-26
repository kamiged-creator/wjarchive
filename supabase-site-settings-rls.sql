-- 복작소 site_settings 보안 정책
-- 공개 페이지는 일반 설정을 읽을 수 있고, 쓰기는 관리자 Supabase 로그인 계정만 허용합니다.
-- 관리자 계정: bokjakso.shop@gmail.com

alter table public.site_settings enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname='public' and tablename='site_settings'
  loop
    execute format('drop policy if exists %I on public.site_settings', p.policyname);
  end loop;
end $$;

create policy "site_settings_public_read"
on public.site_settings
for select
to anon, authenticated
using (key <> 'homepage_backups');

create policy "site_settings_admin_read_backups"
on public.site_settings
for select
to authenticated
using ((auth.jwt() ->> 'email') = 'bokjakso.shop@gmail.com');

create policy "site_settings_admin_insert"
on public.site_settings
for insert
to authenticated
with check ((auth.jwt() ->> 'email') = 'bokjakso.shop@gmail.com');

create policy "site_settings_admin_update"
on public.site_settings
for update
to authenticated
using ((auth.jwt() ->> 'email') = 'bokjakso.shop@gmail.com')
with check ((auth.jwt() ->> 'email') = 'bokjakso.shop@gmail.com');

create policy "site_settings_admin_delete"
on public.site_settings
for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'bokjakso.shop@gmail.com');
