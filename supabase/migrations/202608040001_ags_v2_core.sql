-- AGS v2 core persistence (TASK-0006).
-- Tables: profiles, charts. RLS on everything, scoped per user.
-- Adapted from the prior backend branch; readings/reports arrive with the
-- provider + engine persistence task.

begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or length(btrim(display_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.charts (
  id text primary key check (length(id) between 6 and 160),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null check (length(btrim(first_name)) between 1 and 80),
  last_name text not null check (length(btrim(last_name)) between 1 and 80),
  status text not null default 'processing'
    check (status in ('active', 'processing', 'failed', 'archived')),
  favourite boolean not null default false,
  -- The full canonical Chart object (schema owned by the app types).
  chart_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index charts_user_updated_idx on public.charts (user_id, updated_at desc);
create index charts_user_status_idx on public.charts (user_id, status);
create index charts_user_favourite_idx on public.charts (user_id, favourite);

-- Auto-create a profile row for every new auth user.
create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- Row Level Security: every row is private to its owner.
alter table public.profiles enable row level security;
alter table public.charts enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = user_id);
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy charts_select_own on public.charts
  for select to authenticated using (auth.uid() = user_id);
create policy charts_insert_own on public.charts
  for insert to authenticated with check (auth.uid() = user_id);
create policy charts_update_own on public.charts
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy charts_delete_own on public.charts
  for delete to authenticated using (auth.uid() = user_id);

commit;
