-- OPTIONAL clean slate: removes tables from earlier AGS experiments.
-- Review before running. Safe to run multiple times.
begin;
drop table if exists public.readings cascade;
drop table if exists public.charts cascade;
drop table if exists public.profiles cascade;
drop function if exists public.create_profile_for_new_user() cascade;
commit;
