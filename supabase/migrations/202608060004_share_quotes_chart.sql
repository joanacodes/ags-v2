-- Readee page v2: anchored comments (quote) + chart data on unlock.
-- Paste this whole block in the Supabase SQL Editor and Run.

alter table public.reading_feedback
  add column if not exists quote text
  check (quote is null or length(quote) <= 500);

-- Unlock now also returns the chart itself (wheel + birth details).
create or replace function public.get_shared_readings(p_token text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  l record;
  v_person text;
  v_chart jsonb;
  v_readings jsonb;
begin
  select * into l from share_links where token = p_token and revoked = false;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if l.password_hash <> crypt(coalesce(p_password, ''), l.password_hash) then
    return jsonb_build_object('status', 'wrong_password');
  end if;
  select first_name || ' ' || last_name, chart_payload
    into v_person, v_chart
    from charts where id = l.chart_id;
  select coalesce(jsonb_agg(r.reading order by r.slug), '[]'::jsonb)
    into v_readings
    from readings r
   where r.chart_id = l.chart_id
     and left(r.slug, 1) <> '_'
     and r.reading ? 'sections';
  return jsonb_build_object(
    'status', 'ok',
    'person', v_person,
    'chart', v_chart,
    'readings', v_readings
  );
end;
$$;

-- Feedback gains the anchored quote. The old 6-argument version must be
-- dropped so the API resolves to this one unambiguously.
drop function if exists public.submit_reading_feedback(text, text, text, int, text, text);

create or replace function public.submit_reading_feedback(
  p_token text,
  p_password text,
  p_slug text,
  p_rating int,
  p_comment text,
  p_author text,
  p_quote text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  insert into reading_feedback (token, chart_id, user_id, slug, rating, comment, author, quote)
  values (
    p_token,
    l.chart_id,
    l.user_id,
    p_slug,
    p_rating,
    nullif(trim(coalesce(p_comment, '')), ''),
    nullif(trim(coalesce(p_author, '')), ''),
    nullif(trim(coalesce(p_quote, '')), '')
  );
  return jsonb_build_object('status', 'ok');
end;
$$;

grant execute on function public.get_shared_readings(text, text) to anon, authenticated;
grant execute on function public.submit_reading_feedback(text, text, text, int, text, text, text) to anon, authenticated;
