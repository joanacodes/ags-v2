-- Generated per-domain readings (TASK-0010 groundwork).
begin;

create table public.readings (
  id uuid primary key default gen_random_uuid(),
  chart_id text not null references public.charts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null check (length(slug) between 2 and 60),
  reading jsonb not null,
  engine_version text not null default 'reading-engine-1.0',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chart_id, slug)
);

create index readings_user_idx on public.readings (user_id);
create index readings_chart_idx on public.readings (chart_id);

alter table public.readings enable row level security;

create policy readings_select_own on public.readings
  for select to authenticated using (auth.uid() = user_id);
create policy readings_insert_own on public.readings
  for insert to authenticated with check (auth.uid() = user_id);
create policy readings_update_own on public.readings
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy readings_delete_own on public.readings
  for delete to authenticated using (auth.uid() = user_id);

commit;
