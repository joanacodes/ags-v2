-- Editable AI prompts: each astrologer's own version of a prompt replaces
-- the app default (src/interpretation/prompts.ts). Deleting a row resets
-- that prompt to the default.
-- Paste this whole block in the Supabase SQL Editor and Run.

begin;

create table if not exists public.prompt_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (length(key) between 3 and 80),
  text text not null check (length(text) between 1 and 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.prompt_overrides enable row level security;

create policy prompt_overrides_select_own on public.prompt_overrides
  for select to authenticated using (auth.uid() = user_id);
create policy prompt_overrides_insert_own on public.prompt_overrides
  for insert to authenticated with check (auth.uid() = user_id);
create policy prompt_overrides_update_own on public.prompt_overrides
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy prompt_overrides_delete_own on public.prompt_overrides
  for delete to authenticated using (auth.uid() = user_id);

commit;
