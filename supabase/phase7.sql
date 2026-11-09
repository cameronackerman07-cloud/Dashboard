-- Dashboard phase 7: your year and subjects, and photo uploads.
--
-- How to run it: paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again. Needs schema.sql (the profiles table) first.
-- Profiles already have Row Level Security: each person can only read and change their own.

-- Stop with a plain message if an earlier file hasn't been run yet.
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Run supabase/schema.sql first, then agents.sql, then phase6.sql, then this file.';
  end if;
  if to_regclass('public.user_settings') is null then
    raise exception 'Run supabase/agents.sql first, then phase6.sql, then this file.';
  end if;
  if to_regclass('public.study_sessions') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'uploads' and column_name = 'kind') then
    raise exception 'Run supabase/phase6.sql first (it adds the study timer and big uploads), then run this file again.';
  end if;
end
$$;

alter table public.profiles add column if not exists year_level smallint;
alter table public.profiles add column if not exists subjects text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_year_level_check;
alter table public.profiles add constraint profiles_year_level_check check (year_level is null or year_level between 7 and 12);

alter table public.profiles drop constraint if exists profiles_subjects_check;
alter table public.profiles add constraint profiles_subjects_check check (cardinality(subjects) <= 16);


-- Photos can now be uploaded to Summaries (read by a vision AI).
alter table public.uploads drop constraint if exists uploads_kind_check;
alter table public.uploads add constraint uploads_kind_check check (kind in ('pdf', 'docx', 'pptx', 'txt', 'md', 'image'));

-- Ask the API to pick up the changes straight away.
notify pgrst, 'reload schema';
