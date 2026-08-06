-- Readee share links & feedback (TASK-0012).
-- The astrologer creates a password-protected link; the readee opens it
-- WITHOUT an account, rates readings and leaves notes the astrologer sees.
-- Anonymous access happens ONLY through the security-definer functions
-- below, which validate token + bcrypt password on every call.

begin;

create extension if not exists pgcrypto;

create table public.share_links (
  token text primary key check (length(token) >= 20),
  chart_id text not null references public.charts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  password_hash text not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index share_links_user_idx on public.share_links (user_id);
create index share_links_chart_idx on public.share_links (chart_id);

create table public.reading_feedback (
  id uuid primary key default gen_random_uuid(),
  token text not null references public.share_links(token) on delete cascade,
  chart_id text not null,
  -- Owner of the chart (copied from the link) so RLS can serve their reads.
  user_id uuid not null,
  slug text not null check (length(slug) between 2 and 60),
  rating int check (rating between 1 and 5),
  comment text check (comment is null or length(comment) <= 4000),
  author text check (author is null or length(author) <= 80),
  created_at timestamptz not null default now()
);
create index reading_feedback_owner_idx on public.reading_feedback (user_id, chart_id, slug);

alter table public.share_links enable row level security;
alter table public.reading_feedback enable row level security;

create policy share_links_select_own on public.share_links
  for select to authenticated using (auth.uid() = user_id);
create policy share_links_update_own on public.share_links
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy reading_feedback_select_own on public.reading_feedback
  for select to authenticated using (auth.uid() = user_id);
-- No direct insert policies: writes go through the definer functions only.

-- Owner creates a link for a chart they own; token generated server-side (SQL).
create or replace function public.create_share_link(p_chart_id text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_token text;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;
  if length(coalesce(p_password, '')) < 4 then
    return jsonb_build_object('status', 'weak_password');
  end if;
  if not exists (select 1 from charts c where c.id = p_chart_id and c.user_id = v_user) then
    return jsonb_build_object('status', 'not_owner');
  end if;
  v_token := replace(replace(encode(gen_random_bytes(18), 'base64'), '+', '-'), '/', '_');
  insert into share_links (token, chart_id, user_id, password_hash)
  values (v_token, p_chart_id, v_user, crypt(p_password, gen_salt('bf')));
  return jsonb_build_object('status', 'ok', 'token', v_token);
end;
$$;

-- Readee unlocks the link: validates password, returns person + readings.
create or replace function public.get_shared_readings(p_token text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
  v_person text;
  v_readings jsonb;
begin
  select * into l from share_links where token = p_token and revoked = false;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if l.password_hash <> crypt(coalesce(p_password, ''), l.password_hash) then
    return jsonb_build_object('status', 'wrong_password');
  end if;
  select first_name || ' ' || last_name into v_person from charts where id = l.chart_id;
  select coalesce(jsonb_agg(r.reading order by r.slug), '[]'::jsonb)
    into v_readings
    from readings r
   where r.chart_id = l.chart_id
     and left(r.slug, 1) <> '_'
     and r.reading ? 'sections';
  return jsonb_build_object('status', 'ok', 'person', v_person, 'readings', v_readings);
end;
$$;

-- Readee submits a rating and/or note for one reading.
create or replace function public.submit_reading_feedback(
  p_token text,
  p_password text,
  p_slug text,
  p_rating int,
  p_comment text,
  p_author text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  select * into l from share_links where token = p_token and revoked = false;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if l.password_hash <> crypt(coalesce(p_password, ''), l.password_hash) then
    return jsonb_build_object('status', 'wrong_password');
  end if;
  if p_rating is null and nullif(trim(coalesce(p_comment, '')), '') is null then
    return jsonb_build_object('status', 'empty');
  end if;
  insert into reading_feedback (token, chart_id, user_id, slug, rating, comment, author)
  values (
    p_token,
    l.chart_id,
    l.user_id,
    p_slug,
    p_rating,
    nullif(trim(coalesce(p_comment, '')), ''),
    nullif(trim(coalesce(p_author, '')), '')
  );
  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function public.create_share_link(text, text) to authenticated;
grant execute on function public.get_shared_readings(text, text) to anon, authenticated;
grant execute on function public.submit_reading_feedback(text, text, text, int, text, text) to anon, authenticated;

commit;
