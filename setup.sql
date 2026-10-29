-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

-- 1) Profiles: one row per login, holds the display name.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Auto-create a profile whenever a user is added.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts you already created.
insert into public.profiles (id, display_name)
select id, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- 2) Tasks
create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','review','done')),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  assignee uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 3) Security: only logged-in users can read/write.
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "tasks all" on public.tasks;
create policy "tasks all" on public.tasks for all to authenticated using (true) with check (true);

-- 4) Live updates (both of you see changes instantly).
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;

-- Optional: set nicer display names (replace the emails/names).
-- update public.profiles set display_name = 'Cyrus' where id = (select id from auth.users where email = 'YOUR_EMAIL');
