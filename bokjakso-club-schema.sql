-- 복작소 클럽: 일반 채팅과 분리된 승인형 회원제 (비파괴적 추가)
-- 기존 chat_profiles 사용자 ID를 그대로 사용합니다.
create table if not exists public.bokjakso_club_members (
  profile_id uuid primary key references public.chat_profiles(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists bokjakso_club_members_status_requested_idx
  on public.bokjakso_club_members (status, requested_at desc);

create table if not exists public.bokjakso_club_messages (
  id bigint generated always as identity primary key,
  profile_id uuid references public.chat_profiles(id) on delete set null,
  nickname text not null check (char_length(nickname) between 1 and 20),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists bokjakso_club_messages_created_idx
  on public.bokjakso_club_messages (created_at desc);

alter table public.bokjakso_club_members enable row level security;
alter table public.bokjakso_club_messages enable row level security;
-- DB 접근은 오직 서버 관리키 또는 현재 복작소 서버 인증 계정.
revoke all on public.bokjakso_club_members from anon;
revoke all on public.bokjakso_club_messages from anon;
revoke all on public.bokjakso_club_messages_id_seq from anon;
grant select,insert,update,delete on public.bokjakso_club_members to authenticated;
grant select,insert,update,delete on public.bokjakso_club_messages to authenticated;
grant usage,select on sequence public.bokjakso_club_messages_id_seq to authenticated;
grant all on public.bokjakso_club_members to service_role;
grant all on public.bokjakso_club_messages to service_role;
grant all on sequence public.bokjakso_club_messages_id_seq to service_role;
drop policy if exists "bokjakso server club members" on public.bokjakso_club_members;
create policy "bokjakso server club members" on public.bokjakso_club_members
  for all to authenticated
  using ((select auth.jwt()->>'email') = 'bokjakso.shop@gmail.com')
  with check ((select auth.jwt()->>'email') = 'bokjakso.shop@gmail.com');
drop policy if exists "bokjakso server club messages" on public.bokjakso_club_messages;
create policy "bokjakso server club messages" on public.bokjakso_club_messages
  for all to authenticated
  using ((select auth.jwt()->>'email') = 'bokjakso.shop@gmail.com')
  with check ((select auth.jwt()->>'email') = 'bokjakso.shop@gmail.com');
