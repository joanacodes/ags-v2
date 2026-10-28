-- The Studio's clock (TASK-0014). Every 15 minutes pg_cron asks pg_net to POST the Studio's tick route
-- with a secret; the route reads each worker's schedule from studio_settings and dispatches what is due.
-- One clock, in the database, so a schedule changed in Settings takes effect without a deploy and the
-- GitHub workflows carry no schedule of their own (their minutes are only spent when work is due).
--
-- The address and the secret are kept in Vault, never in this file. After running this block, run once
-- in the SQL Editor (DEPLOY.md, step "The tick"):
--   select public.studio_tick_setup('https://<the Studio's address>/api/cron/tick', '<STUDIO_TICK_SECRET>');
-- and to stop the clock: select public.studio_tick_stop();
-- Paste this whole block in the Supabase SQL Editor and Run, after 202610280001_studio.sql.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.studio_tick_setup(p_url text, p_secret text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if coalesce(p_url, '') !~ '^https://[^\s/]+(/[^\s]*)?/api/cron/tick$' then
    raise exception 'the tick address must be https://…/api/cron/tick';
  end if;
  if length(coalesce(p_secret, '')) < 32 then
    raise exception 'the secret must be at least 32 characters (the same as STUDIO_TICK_SECRET on Vercel)';
  end if;
  select id into v_id from vault.secrets where name = 'studio_tick_url';
  if v_id is null then
    perform vault.create_secret(p_url, 'studio_tick_url', 'The Studio''s tick route');
  else
    perform vault.update_secret(v_id, p_url);
  end if;
  select id into v_id from vault.secrets where name = 'studio_tick_secret';
  if v_id is null then
    perform vault.create_secret(p_secret, 'studio_tick_secret', 'The bearer secret the tick route expects');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'studio-tick';
  -- The job reads both secrets when it runs, so rotating them never needs the job to be rewritten.
  perform cron.schedule(
    'studio-tick',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'studio_tick_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'studio_tick_secret')
        ),
        body := '{"from":"pg_cron"}'::jsonb,
        timeout_milliseconds := 55000
      );
    $job$
  );
  return 'the tick runs every 15 minutes';
end;
$$;
revoke all on function public.studio_tick_setup(text, text) from public, anon, authenticated, service_role;

create or replace function public.studio_tick_stop()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'studio-tick';
  return 'the tick is stopped';
end;
$$;
revoke all on function public.studio_tick_stop() from public, anon, authenticated, service_role;

-- The check: a plain-http address and a short secret are refused, and trying leaves nothing behind.
do $$
declare
  v_refused int := 0;
  v_before int;
  v_jobs int;
begin
  select count(*) into v_before from vault.secrets where name in ('studio_tick_url', 'studio_tick_secret');
  select count(*) into v_jobs from cron.job where jobname = 'studio-tick';
  begin
    perform public.studio_tick_setup('http://example.com/api/cron/tick', repeat('x', 40));
  exception when raise_exception then
    v_refused := v_refused + 1;
  end;
  begin
    perform public.studio_tick_setup('https://studio.example.com/api/cron/tick', 'short');
  exception when raise_exception then
    v_refused := v_refused + 1;
  end;
  if v_refused <> 2 then
    raise exception 'studio_tick_setup accepted a plain-http address or a short secret';
  end if;
  if (select count(*) from vault.secrets where name in ('studio_tick_url', 'studio_tick_secret')) <> v_before
     or (select count(*) from cron.job where jobname = 'studio-tick') <> v_jobs then
    raise exception 'a refused setup left a secret or a job behind';
  end if;
end;
$$;

commit;
