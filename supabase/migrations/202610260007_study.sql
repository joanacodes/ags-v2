-- The Astro Study test (TASK-0013): a blind self-recognition quiz.
-- Each question shows three statements about one area of life: one written from the participant's
-- chart, two from fake charts made in advance. Participants have no account: everything they do goes
-- through the app's server routes with the secret key, so there are no insert or update policies
-- here; the owner (the architect) reads everything, and nobody else reads anything.
-- Paste this whole block in the Supabase SQL Editor and Run, before merging the change that needs it.

begin;

-- One test taken by one person.
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- The participant's chart, in the owner's library (kept if the session row goes).
  chart_id text references public.charts(id) on delete set null,
  -- Their readee link, made when they finish (password: their birth date).
  share_token text references public.share_links(token) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 80),
  email text not null check (length(email) between 3 and 254),
  language text not null default 'en' check (language in ('en', 'fr')),
  length text not null check (length in ('short', 'medium', 'long')),
  birth_time_known boolean not null,
  study_consent_at timestamptz not null,
  -- Null = no news. Set only when the participant ticked the (unticked) box.
  news_consent_at timestamptz,
  source text check (source is null or length(source) <= 200),
  -- What the quiz was drawn with, so it can be rebuilt and audited.
  seed text not null check (length(seed) between 8 and 64),
  model text not null,
  prompt_version text not null,
  -- 'building' while the chart and questions are made: the row exists from the first moment, so the
  -- daily limit counts a test before any money is spent on it, and a burst of starts can't slip past.
  status text not null default 'building' check (status in ('building', 'ready', 'finished')),
  total int not null default 0 check (total between 0 and 30),
  answered int not null default 0,
  recognised int not null default 0,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists study_sessions_created_idx on public.study_sessions (created_at desc);
create index if not exists study_sessions_email_idx on public.study_sessions (lower(email), created_at desc);

-- One question of a test. `options` holds the three statements as shown (A, B, C), each with where it
-- came from; `correct` is the participant's own. The participant's browser never receives `correct`
-- or the origins before answering.
create table if not exists public.study_items (
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  position int not null check (position >= 0),
  area text not null,
  anchor text not null,
  key text not null,
  options jsonb not null,
  correct text not null check (correct in ('A', 'B', 'C')),
  answer text check (answer in ('A', 'B', 'C')),
  answered_at timestamptz,
  primary key (session_id, position)
);

-- The fake charts the wrong answers are written from (30, the architect's number). Never in the library.
create table if not exists public.study_fake_charts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  birth jsonb not null,
  chart_payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Their statements, per language, area and anchor, with the model and prompt that wrote them: a quiz
-- only uses statements written the same way as the participant's own.
create table if not exists public.study_decoys (
  id uuid primary key default gen_random_uuid(),
  fake_chart_id uuid not null references public.study_fake_charts(id) on delete cascade,
  language text not null check (language in ('en', 'fr')),
  area text not null,
  anchor text not null,
  key text not null,
  text text not null check (length(text) between 10 and 600),
  words int not null check (words > 0),
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists study_decoys_lookup_idx
  on public.study_decoys (language, area, anchor, model, prompt_version);

alter table public.study_sessions enable row level security;
alter table public.study_items enable row level security;
alter table public.study_fake_charts enable row level security;
alter table public.study_decoys enable row level security;

drop policy if exists study_sessions_select_owner on public.study_sessions;
create policy study_sessions_select_owner on public.study_sessions
  for select to authenticated using (auth.uid() = owner_id);
drop policy if exists study_sessions_delete_owner on public.study_sessions;
create policy study_sessions_delete_owner on public.study_sessions
  for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists study_items_select_owner on public.study_items;
create policy study_items_select_owner on public.study_items
  for select to authenticated using (
    exists (select 1 from public.study_sessions s where s.id = session_id and s.owner_id = auth.uid())
  );

drop policy if exists study_fake_charts_select_owner on public.study_fake_charts;
create policy study_fake_charts_select_owner on public.study_fake_charts
  for select to authenticated using (auth.uid() = owner_id);

drop policy if exists study_decoys_select_owner on public.study_decoys;
create policy study_decoys_select_owner on public.study_decoys
  for select to authenticated using (
    exists (select 1 from public.study_fake_charts f where f.id = fake_chart_id and f.owner_id = auth.uid())
  );

-- A readee link for a study chart. create_share_link needs a signed-in owner; a participant finishing
-- the test has no session, so the server calls this one with the secret key, naming the owner.
create or replace function public.create_study_share_link(p_owner uuid, p_chart_id text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if length(coalesce(p_password, '')) < 4 then
    return jsonb_build_object('status', 'weak_password');
  end if;
  if not exists (select 1 from charts c where c.id = p_chart_id and c.user_id = p_owner) then
    return jsonb_build_object('status', 'not_owner');
  end if;
  v_token := replace(replace(encode(gen_random_bytes(18), 'base64'), '+', '-'), '/', '_');
  insert into share_links (token, chart_id, user_id, password_hash)
  values (v_token, p_chart_id, p_owner, crypt(p_password, gen_salt('bf')));
  return jsonb_build_object('status', 'ok', 'token', v_token);
end;
$$;
revoke all on function public.create_study_share_link(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_study_share_link(uuid, text, text) to service_role;

-- A nickname is one word: a chart's last name may now be empty.
alter table public.charts drop constraint if exists charts_last_name_check;
alter table public.charts add constraint charts_last_name_check check (length(last_name) <= 80);

commit;
