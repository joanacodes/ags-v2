-- The Studio (TASK-0014): The Astro Study's content agency, run by AI agents, approved by one person.
--
-- Every table here is read by the owner only and written only by the Studio's server and workers with
-- the secret key: there are no insert, update or delete policies, as for the Study's tables. Who the
-- owner is lives in one row of studio_owner (set at the end of this file's instructions, below), and one
-- function, studio_is_owner(), is the whole read policy. Every change of status on a card, a piece, a
-- reply or a reminder is written to studio_events by a trigger, with who or what made it, so the audit
-- trail can't be skipped by a code path that forgets it.
--
-- Run once in the Supabase SQL Editor of the AGS project (the Study's tables are read from here), then:
--   insert into public.studio_owner (user_id) values ('<your Supabase user id>') on conflict do nothing;
-- Rejoinable: every object is created if missing or replaced.

begin;

-- ------------------------------------------------------------------------------------------------
-- Who may read. Not a foreign key to auth.users: the check at the end of this file proves the policies
-- with a made-up owner inside a savepoint, and nothing here should depend on the auth schema's columns.
create table if not exists public.studio_owner (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

create or replace function public.studio_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.studio_owner o where o.user_id = auth.uid());
$$;
revoke all on function public.studio_is_owner() from public;
grant execute on function public.studio_is_owner() to anon, authenticated, service_role;

create or replace function public.studio_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------------------------------------------
-- Settings: one row per node of the Map ('global' holds the pause and the approval mode). Defaults are in
-- code; a row here only holds what the owner changed, and takes effect on the next run without a deploy.
create table if not exists public.studio_settings (
  node text primary key check (length(node) between 1 and 80),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'owner'
);

-- Where each node sits on the Map, when the owner moved it.
create table if not exists public.studio_nodes (
  node text primary key check (length(node) between 1 and 80),
  x double precision not null,
  y double precision not null,
  collapsed boolean not null default false,
  updated_at timestamptz not null default now()
);

-- The brand kit, one row per saved version; every card records the version it was written under.
create table if not exists public.studio_kit_versions (
  version int primary key check (version > 0),
  yaml text not null check (length(yaml) between 10 and 400000),
  note text,
  created_at timestamptz not null default now(),
  created_by text not null default 'owner'
);

-- Prompt versions per agent; version 1 of each is the one in the repository (src/studio/prompts/).
create table if not exists public.studio_prompts (
  agent text not null check (length(agent) between 1 and 40),
  version int not null check (version > 0),
  text text not null check (length(text) between 10 and 200000),
  note text,
  created_at timestamptz not null default now(),
  created_by text not null default 'owner',
  primary key (agent, version)
);

-- The hook bank, with each hook's results.
create table if not exists public.studio_hooks (
  id uuid primary key default gen_random_uuid(),
  text text not null check (length(btrim(text)) between 3 and 300),
  pillar text not null check (pillar in ('test', 'placements', 'tested', 'sky')),
  language text not null check (language in ('en', 'fr')),
  retired boolean not null default false,
  stats jsonb not null default '{}'::jsonb,
  source text not null default 'kit',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists studio_hooks_text_idx on public.studio_hooks (language, lower(text));

-- ------------------------------------------------------------------------------------------------
-- One idea for one week. A 'both' card is written by both writers separately, never translated.
create table if not exists public.studio_cards (
  id uuid primary key default gen_random_uuid(),
  week text not null check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  pillar text not null check (pillar in ('test', 'placements', 'tested', 'sky')),
  language text not null check (language in ('en', 'fr', 'both')),
  idea text not null check (length(btrim(idea)) between 3 and 400),
  hook text not null check (length(btrim(hook)) between 3 and 300),
  points jsonb not null default '[]'::jsonb,
  figures jsonb not null default '[]'::jsonb,
  cta text not null default 'comment TEST',
  anchor text,
  sky_date date,
  formats text[] not null default '{}',
  src text,
  kit_version int,
  prompt_version int,
  parent uuid references public.studio_cards(id) on delete set null,
  hook_id uuid references public.studio_hooks(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'killed', 'used')),
  reason text,
  run_id uuid,
  created_by text not null default 'strategist',
  approved_at timestamptz,
  approved_by uuid,
  updated_by text not null default 'strategist',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_cards_week_idx on public.studio_cards (week, status);

-- One piece on one platform, made from a card.
create table if not exists public.studio_posts (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.studio_cards(id) on delete cascade,
  platform text not null check (platform in (
    'tiktok', 'instagram', 'facebook', 'youtube', 'pinterest', 'threads', 'bluesky', 'x', 'mastodon',
    'substack', 'medium', 'site')),
  format text not null check (format in (
    'video', 'carousel', 'text', 'pin', 'still', 'story', 'issue', 'long_video', 'article')),
  language text not null check (language in ('en', 'fr')),
  script text,
  lines jsonb,
  caption text,
  title text,
  description text,
  tags text[] not null default '{}',
  slides jsonb,
  spec jsonb,
  disclosure boolean not null default false,
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in (
    'draft', 'approved', 'rendered', 'queued', 'posted', 'failed', 'killed')),
  gate jsonb,
  by_hand boolean not null default false,
  platform_post_id text,
  platform_url text,
  -- What a platform handed back half-way (a container id, an upload session), so a retry resumes.
  platform_state jsonb,
  posted_at timestamptz,
  error text,
  retries int not null default 0 check (retries >= 0),
  approved_at timestamptz,
  approved_by uuid,
  confirmed_at timestamptz,
  run_id uuid,
  updated_by text not null default 'writer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_posts_card_idx on public.studio_posts (card_id);
create index if not exists studio_posts_due_idx on public.studio_posts (status, scheduled_at);

-- One rendered file.
create table if not exists public.studio_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.studio_posts(id) on delete cascade,
  kind text not null check (kind in ('video', 'image', 'audio', 'srt', 'thumbnail', 'timeline')),
  path text not null,
  bytes bigint not null default 0,
  duration_ms int,
  width int,
  height int,
  sha256 text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists studio_media_post_idx on public.studio_media (post_id, kind);

-- One piece's numbers for one day.
create table if not exists public.studio_metrics (
  post_id uuid not null references public.studio_posts(id) on delete cascade,
  day date not null,
  views int,
  likes int,
  comments int,
  shares int,
  saves int,
  link_taps int,
  keyword_comments int,
  source text not null,
  fetched_at timestamptz not null default now(),
  primary key (post_id, day)
);
create index if not exists studio_metrics_day_idx on public.studio_metrics (day);

-- One comment or mention and its drafted reply. Kept 30 days (expires_at), then deleted.
create table if not exists public.studio_replies (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  thread_ref text not null,
  parent_ref text,
  post_id uuid references public.studio_posts(id) on delete set null,
  author_handle text,
  author_ref text,
  their_text text not null,
  their_lang text,
  received_at timestamptz not null,
  klass text check (klass is null or klass in (
    'question', 'praise', 'sceptic', 'spam', 'distress', 'complaint', 'press', 'under18', 'other')),
  draft_reply text,
  flag text not null default 'none' check (flag in ('none', 'needs_owner', 'distress', 'complaint', 'press', 'under18')),
  flag_reason text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'skipped')),
  sent_at timestamptz,
  sent_ref text,
  expires_at timestamptz not null default (now() + interval '30 days'),
  updated_by text not null default 'community',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, thread_ref)
);
create index if not exists studio_replies_status_idx on public.studio_replies (status, flag, received_at desc);

-- One agent or worker run: the audit trail, and what the caps read.
create table if not exists public.studio_runs (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  trigger text not null check (trigger in ('cron', 'dispatch', 'manual', 'interactive', 'tick')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  model text,
  prompt_version int,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  wrote jsonb not null default '{}'::jsonb,
  outcome text not null default 'running' check (outcome in (
    'running', 'ok', 'failed', 'capped', 'skipped', 'dry_run')),
  error text,
  log_url text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists studio_runs_agent_idx on public.studio_runs (agent, started_at desc);
create index if not exists studio_runs_started_idx on public.studio_runs (started_at desc);

-- Every change of status, outbox call and reminder delivery, with who or what made it.
create table if not exists public.studio_events (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null,
  from_status text,
  to_status text,
  actor text not null,
  at timestamptz not null default now(),
  note text
);
create index if not exists studio_events_row_idx on public.studio_events (table_name, row_id, at desc);
create index if not exists studio_events_at_idx on public.studio_events (at desc);

-- Reminders: rows, so agents can make them, the Map can show them and the calendar feed can carry them.
create table if not exists public.studio_reminders (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'approve-week', 'replies-due', 'scorecard', 'by-hand-post', 'connection-expiring', 'cap-near',
    'calendar-event', 'sky-event', 'custom', 'agent', 'tick-stalled')),
  title text not null check (length(btrim(title)) between 1 and 200),
  body text,
  due_at timestamptz not null,
  timezone text not null default 'Europe/Paris',
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'monthly')),
  channels text[] not null default '{in_app}',
  urgent boolean not null default false,
  linked_table text,
  linked_id text,
  link text,
  created_by text not null default 'owner',
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'snoozed', 'done', 'cancelled')),
  snoozed_until timestamptz,
  sent_at timestamptz,
  -- Reminders the Studio makes by itself carry a key, so the same one is never made twice.
  dedupe_key text unique,
  updated_by text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_reminders_due_idx on public.studio_reminders (status, due_at);

-- The sky: ingresses, stations, lunations, eclipses, each with its Paris time and two sources.
create table if not exists public.studio_sky (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time_paris time,
  kind text not null check (kind in ('ingress', 'station', 'lunation', 'eclipse')),
  body text not null,
  sign text,
  degree numeric(5, 2),
  event text not null,
  source1 text,
  source2 text,
  created_by text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (date, kind, body, event)
);

-- The launch calendar and anything the owner adds.
create table if not exists public.studio_calendar (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  event text not null check (length(btrim(event)) between 1 and 200),
  note text,
  source text not null default 'owner',
  remind boolean not null default true,
  created_at timestamptz not null default now(),
  unique (date, event)
);

-- One platform's connection. The token itself is in Vault, never here.
create table if not exists public.studio_connections (
  platform text primary key,
  status text not null default 'disconnected' check (status in ('connected', 'expiring', 'expired', 'disconnected')),
  account_label text,
  account_ref text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  vault_secret_id uuid,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Stripe checkout sessions, by their source tag.
create table if not exists public.studio_orders (
  session_id text primary key,
  created timestamptz not null,
  amount int not null default 0,
  currency text,
  client_reference_id text,
  product text,
  status text,
  fetched_at timestamptz not null default now()
);
create index if not exists studio_orders_created_idx on public.studio_orders (created desc);

-- Presets the owner saves from the Video studio, on top of the templates in the repository.
create table if not exists public.studio_templates (
  id uuid primary key default gen_random_uuid(),
  base text not null,
  name text not null check (length(btrim(name)) between 1 and 80),
  spec jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- One scorecard a week, every figure computed by code.
create table if not exists public.studio_scorecards (
  week text primary key check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  figures jsonb not null,
  verdicts jsonb not null default '[]'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  for_owner jsonb not null default '[]'::jsonb,
  cost_usd numeric(12, 6) not null default 0,
  run_id uuid,
  created_at timestamptz not null default now()
);

-- What the owner types on Friday: her hours, the DMs if ManyChat can't say, Substack and Medium by hand.
create table if not exists public.studio_weekly_inputs (
  week text primary key check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  owner_hours numeric(5, 2),
  dm_count int,
  manual jsonb not null default '{}'::jsonb,
  note text,
  updated_at timestamptz not null default now()
);

-- The pages the strategist may take ideas from (the Astro Study site, Maison Tarot when turned on).
create table if not exists public.studio_sources (
  id uuid primary key default gen_random_uuid(),
  site text not null,
  language text not null check (language in ('en', 'fr')),
  path text not null,
  url text,
  section text,
  title text not null,
  description text,
  updated_at timestamptz not null default now(),
  unique (site, path)
);

-- Every text-to-speech call, so the monthly minutes cap is read without asking ElevenLabs.
create table if not exists public.studio_tts (
  hash text primary key,
  voice_id text not null,
  characters int not null,
  duration_ms int not null,
  path text not null,
  created_at timestamptz not null default now()
);

-- Kept for web push, which is not built yet (TASK-0014, decision 17).
create table if not exists public.studio_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------------------------------------
-- updated_at, and the audit trail of every status change.
do $$
declare
  t text;
begin
  foreach t in array array['studio_hooks', 'studio_cards', 'studio_posts', 'studio_replies', 'studio_reminders']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.studio_touch()', t, t);
  end loop;
end;
$$;

create or replace function public.studio_log_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.studio_events (table_name, row_id, from_status, to_status, actor)
    values (tg_table_name, new.id::text, null, new.status, coalesce(new.updated_by, 'unknown'));
  elsif new.status is distinct from old.status then
    insert into public.studio_events (table_name, row_id, from_status, to_status, actor)
    values (tg_table_name, new.id::text, old.status, new.status, coalesce(new.updated_by, 'unknown'));
  end if;
  return new;
end;
$$;
revoke all on function public.studio_log_status() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['studio_cards', 'studio_posts', 'studio_replies', 'studio_reminders']
  loop
    execute format('drop trigger if exists %I_status on public.%I', t, t);
    execute format('create trigger %I_status after insert or update of status on public.%I for each row execute function public.studio_log_status()', t, t);
  end loop;
end;
$$;

-- ------------------------------------------------------------------------------------------------
-- Row level security: on everywhere, one read policy, no write policy.
do $$
declare
  t text;
begin
  foreach t in array array[
    'studio_owner', 'studio_settings', 'studio_nodes', 'studio_kit_versions', 'studio_prompts', 'studio_hooks',
    'studio_cards', 'studio_posts', 'studio_media', 'studio_metrics', 'studio_replies', 'studio_runs',
    'studio_events', 'studio_reminders', 'studio_sky', 'studio_calendar', 'studio_connections', 'studio_orders',
    'studio_templates', 'studio_scorecards', 'studio_weekly_inputs', 'studio_sources', 'studio_tts',
    'studio_push_subscriptions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke all on table public.%I from authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_owner', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.studio_is_owner())', t || '_select_owner', t);
  end loop;
end;
$$;
grant usage, select on sequence public.studio_events_id_seq to service_role;

-- ------------------------------------------------------------------------------------------------
-- Media: a private bucket, read through signed URLs the server makes.
insert into storage.buckets (id, name, public)
values ('studio', 'studio', false)
on conflict (id) do nothing;

-- Platform tokens live in Vault. The server and the workers reach them through these three functions,
-- which only the service role may call; the browser never can.
create or replace function public.studio_secret_put(p_name text, p_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
  v_name text := 'studio:' || p_name;
begin
  if p_name !~ '^[a-z0-9_-]{2,40}$' then
    raise exception 'studio_secret_put: bad name %', p_name;
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    v_id := vault.create_secret(p_secret, v_name, 'The Studio: ' || p_name);
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
  return v_id;
end;
$$;

create or replace function public.studio_secret_get(p_name text)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'studio:' || p_name limit 1;
$$;

create or replace function public.studio_secret_delete(p_name text)
returns void
language sql
security definer
set search_path = public, vault
as $$
  delete from vault.secrets where name = 'studio:' || p_name;
$$;

-- The keys the owner pastes in Settings → Keys ('studio:key-…'): the server and the workers load them
-- together, at most once a minute, so one call reads them all.
create or replace function public.studio_keys()
returns table (name text, secret text, updated_at timestamptz)
language sql
security definer
set search_path = public, vault
as $$
  select substr(s.name, 8), s.decrypted_secret, s.updated_at
  from vault.decrypted_secrets s
  where s.name like 'studio:key-%';
$$;

revoke all on function public.studio_secret_put(text, text) from public, anon, authenticated;
revoke all on function public.studio_secret_get(text) from public, anon, authenticated;
revoke all on function public.studio_secret_delete(text) from public, anon, authenticated;
revoke all on function public.studio_keys() from public, anon, authenticated;
grant execute on function public.studio_secret_put(text, text) to service_role;
grant execute on function public.studio_secret_get(text) to service_role;
grant execute on function public.studio_secret_delete(text) to service_role;
grant execute on function public.studio_keys() to service_role;

-- ------------------------------------------------------------------------------------------------
-- The check: run the real case, leave nothing behind. A made-up owner and a made-up stranger read a card
-- that exists only inside a savepoint; the owner must see it, the stranger and an anonymous visitor
-- must not, and nobody but the service role may write.
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_stranger uuid := gen_random_uuid();
  v_card uuid;
  v_seen int;
  v_wrote boolean;
  v_read boolean;
begin
  begin
    insert into public.studio_owner (user_id) values (v_owner);
    insert into public.studio_cards (week, pillar, language, idea, hook)
    values ('2026-W45', 'test', 'en', 'The check of the migration', 'A hook nobody will read')
    returning id into v_card;

    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    execute 'set local role authenticated';
    select count(*) into v_seen from public.studio_cards where id = v_card;
    execute 'reset role';
    if v_seen <> 1 then
      raise exception 'studio check: the owner cannot read a card (saw %)', v_seen;
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_stranger::text, true);
    execute 'set local role authenticated';
    select count(*) into v_seen from public.studio_cards where id = v_card;
    v_wrote := true;
    begin
      update public.studio_cards set status = 'approved' where id = v_card;
    exception when insufficient_privilege then
      v_wrote := false;
    end;
    execute 'reset role';
    if v_seen <> 0 then
      raise exception 'studio check: a stranger can read a card';
    end if;
    if v_wrote then
      raise exception 'studio check: a signed-in user can write a card';
    end if;

    execute 'set local role anon';
    begin
      select count(*) into v_seen from public.studio_cards where id = v_card;
    exception when insufficient_privilege then
      v_seen := 0;
    end;
    execute 'reset role';
    if v_seen <> 0 then
      raise exception 'studio check: an anonymous visitor can read a card';
    end if;

    if (select count(*) from public.studio_events where table_name = 'studio_cards' and row_id = v_card::text) <> 1 then
      raise exception 'studio check: the new card was not written to the audit trail';
    end if;

    -- A key pasted in Settings → Keys comes back to the server, and to nobody signed in.
    perform public.studio_secret_put('key-studio-check', 'a value nobody keeps');
    if not exists (select 1 from public.studio_keys() where name = 'key-studio-check' and secret = 'a value nobody keeps') then
      raise exception 'studio check: a saved key does not come back';
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_read := true;
    begin
      perform * from public.studio_keys();
    exception when insufficient_privilege then
      v_read := false;
    end;
    execute 'reset role';
    if v_read then
      raise exception 'studio check: a signed-in user can read the keys';
    end if;

    raise exception using errcode = 'P0001', message = 'studio-check-passed';
  exception when raise_exception then
    if sqlerrm <> 'studio-check-passed' then
      raise;
    end if;
  end;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

commit;
