-- Background reading generation: "Generate all categories" queues one job
-- per reading; a Cloudflare timer (every minute) writes them one at a time
-- on the server, so it keeps going when the phone is locked or the app is
-- closed.
-- Paste this whole block in the Supabase SQL Editor and Run.

begin;

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chart_id text not null references public.charts(id) on delete cascade,
  slug text not null check (length(slug) between 2 and 60),
  position int not null default 0,
  style text not null default 'conversational' check (style in ('clinical', 'conversational', 'poetic')),
  language text not null default 'en' check (length(language) between 2 and 5),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- One waiting/running job per reading.
create unique index if not exists generation_jobs_active_unique
  on public.generation_jobs (chart_id, slug) where status in ('queued', 'running');
create index if not exists generation_jobs_queue
  on public.generation_jobs (status, created_at, position);

alter table public.generation_jobs enable row level security;

create policy generation_jobs_select_own on public.generation_jobs
  for select to authenticated using (auth.uid() = user_id);
create policy generation_jobs_insert_own on public.generation_jobs
  for insert to authenticated with check (
    auth.uid() = user_id
    and status = 'queued'
    and exists (select 1 from public.charts c where c.id = chart_id and c.user_id = auth.uid())
  );
create policy generation_jobs_delete_own on public.generation_jobs
  for delete to authenticated using (auth.uid() = user_id);

-- Takes the next job for the server, one running job per person at a time.
-- Jobs left "running" by a crashed run go back to the queue after 15 min.
-- Only the server (secret key) may call it.
create or replace function public.claim_generation_job()
returns setof public.generation_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('ags.generation_jobs'));

  update public.generation_jobs
     set status = case when attempts >= 3 then 'failed' else 'queued' end,
         error = case when attempts >= 3 then 'Interrupted too many times.' else error end,
         finished_at = case when attempts >= 3 then now() else null end
   where status = 'running' and started_at < now() - interval '15 minutes';

  return query
  update public.generation_jobs j
     set status = 'running', started_at = now(), attempts = j.attempts + 1
   where j.id = (
     select q.id
       from public.generation_jobs q
      where q.status = 'queued'
        and not exists (
          select 1 from public.generation_jobs r
           where r.user_id = q.user_id and r.status = 'running'
        )
      order by q.created_at, q.position
      limit 1
      for update skip locked
   )
  returning j.*;
end;
$$;

revoke execute on function public.claim_generation_job() from public, anon, authenticated;

commit;
