-- TASK-0015 — Forecast look-back marks.
-- For each period the forecast finds in someone's past, the owner marks whether it was recognised. The marks show,
-- per technique and per tier, which signals hold: the forecast's weights are tuned from them.
-- Run once in the Supabase SQL Editor (see supabase/README.md). Until then the marks live in server memory only,
-- and the Forecast page says so.

create table if not exists public.forecast_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- text, not a foreign key: the demo charts are not rows of public.charts
  chart_id text not null,
  key text not null,
  verdict text not null check (verdict in ('yes', 'no')),
  label text not null default '',
  technique text not null default '',
  score numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, chart_id, key)
);

alter table public.forecast_marks enable row level security;

drop policy if exists forecast_marks_select_own on public.forecast_marks;
create policy forecast_marks_select_own on public.forecast_marks for select using (user_id = auth.uid());
drop policy if exists forecast_marks_insert_own on public.forecast_marks;
create policy forecast_marks_insert_own on public.forecast_marks for insert with check (user_id = auth.uid());
drop policy if exists forecast_marks_update_own on public.forecast_marks;
create policy forecast_marks_update_own on public.forecast_marks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists forecast_marks_delete_own on public.forecast_marks;
create policy forecast_marks_delete_own on public.forecast_marks for delete using (user_id = auth.uid());

create index if not exists forecast_marks_chart on public.forecast_marks (user_id, chart_id);
