-- NNG profiles: email-lookup table for GM character reassignment
-- Paste into Supabase SQL Editor and run once, after campaigns-setup.sql
create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Any authenticated user can look up others by email (needed for GM reassign)
create policy "Authenticated read profiles" on public.profiles
  for select to authenticated using (true);

-- Users write only their own row
create policy "Own profile insert" on public.profiles
  for insert to authenticated with check (user_id = auth.uid());

create policy "Own profile update" on public.profiles
  for update to authenticated using (user_id = auth.uid());
