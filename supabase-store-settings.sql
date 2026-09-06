create table if not exists public.store_settings (
  id text primary key default 'main',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.store_settings enable row level security;

drop policy if exists "store settings are publicly readable" on public.store_settings;
create policy "store settings are publicly readable"
on public.store_settings for select to anon using (true);

drop policy if exists "store settings service role write" on public.store_settings;
create policy "store settings service role write"
on public.store_settings for all to service_role using (true) with check (true);
