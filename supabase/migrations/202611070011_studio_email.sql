-- The Studio's own email (TASK-0017): one space per brand, never shared. Each brand has its settings, its
-- designs (emails made of blocks), its workflows (what is sent when, to whom) and its contacts (who agreed
-- to receive them, and how). Sending goes through Resend.
--
-- As for every Studio table: the owner reads (studio_is_owner()), only the Studio's server writes (the
-- secret key), and a change of status on a workflow or a contact is written to studio_events by a trigger.
-- Paste this whole block in the Supabase SQL Editor of AGS's project and Run, after 202610280008_studio.sql.
-- Rejoinable: every object is created if missing or replaced.

begin;

create table if not exists public.studio_email_brands (
  brand text primary key check (brand in ('astrostudy', 'maison-tarot')),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'owner'
);

create table if not exists public.studio_email_designs (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('astrostudy', 'maison-tarot')),
  name text not null check (length(btrim(name)) between 1 and 80),
  subject text not null default '' check (length(subject) <= 200),
  preheader text not null default '' check (length(preheader) <= 200),
  language text not null default 'en' check (language in ('en', 'fr')),
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'owner'
);
create index if not exists studio_email_designs_brand_idx on public.studio_email_designs (brand, updated_at desc);

create table if not exists public.studio_email_workflows (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('astrostudy', 'maison-tarot')),
  name text not null check (length(btrim(name)) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'paused', 'on')),
  trigger jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'owner'
);
create index if not exists studio_email_workflows_brand_idx on public.studio_email_workflows (brand, updated_at desc);

-- One row per brand and address: the same person can be in both brands' lists, each with its own consent.
create table if not exists public.studio_email_contacts (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('astrostudy', 'maison-tarot')),
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  name text not null default '' check (length(name) <= 120),
  language text not null default 'en' check (language in ('en', 'fr')),
  status text not null default 'pending' check (status in ('pending', 'subscribed', 'unsubscribed', 'bounced', 'complained')),
  tags text[] not null default '{}',
  source text not null default '' check (length(source) <= 80),
  -- How they agreed: the form's words, or what the owner attests for someone added by hand.
  consent_text text not null check (length(btrim(consent_text)) between 3 and 500),
  consent_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default 'owner',
  unique (brand, email)
);
create index if not exists studio_email_contacts_brand_status_idx on public.studio_email_contacts (brand, status);

-- updated_at, and the audit trail of every change of status.
do $$
declare
  t text;
begin
  foreach t in array array['studio_email_brands', 'studio_email_designs', 'studio_email_workflows', 'studio_email_contacts']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.studio_touch()', t, t);
  end loop;
  foreach t in array array['studio_email_workflows', 'studio_email_contacts']
  loop
    execute format('drop trigger if exists %I_status on public.%I', t, t);
    execute format('create trigger %I_status after insert or update of status on public.%I for each row execute function public.studio_log_status()', t, t);
  end loop;
end;
$$;

-- Row level security: on, one read policy for the owner, no write policy.
do $$
declare
  t text;
begin
  foreach t in array array['studio_email_brands', 'studio_email_designs', 'studio_email_workflows', 'studio_email_contacts']
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

commit;
