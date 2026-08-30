create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  title text not null default '새 상품',
  description text not null default '',
  price_text text not null default '가격 준비중',
  category text not null default 'keyring',
  status text not null default 'preparing',
  main_image_url text not null default '',
  detail_image_urls jsonb not null default '[]'::jsonb,
  sort_order integer not null default 10,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_products
add column if not exists category text not null default 'keyring';

alter table public.store_products enable row level security;

drop policy if exists "store products are publicly readable" on public.store_products;
create policy "store products are publicly readable"
on public.store_products
for select
to anon
using (is_visible = true);

create index if not exists store_products_visible_order_idx
on public.store_products (is_visible, sort_order desc, created_at desc);

create or replace function public.set_store_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists store_products_updated_at on public.store_products;
create trigger store_products_updated_at
before update on public.store_products
for each row
execute function public.set_store_products_updated_at();

create table if not exists public.store_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  contact text not null default '',
  product_name text not null default '',
  quantity text not null default '',
  message text not null default '',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.store_inquiries
add column if not exists quantity text not null default '';

alter table public.store_inquiries enable row level security;

drop policy if exists "store inquiries are service role only" on public.store_inquiries;
create policy "store inquiries are service role only"
on public.store_inquiries
for all
to service_role
using (true)
with check (true);

create index if not exists store_inquiries_created_at_idx
on public.store_inquiries (created_at desc);
