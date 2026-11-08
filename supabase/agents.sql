-- Dashboard: agents, notifications, AI keys and connections.
--
-- How to run it: run supabase/schema.sql first (once), then paste this whole file
-- into Supabase → SQL Editor → New query → Run. Safe to run again whenever it changes.
--
-- Every table has Row Level Security ON. Tables holding secrets (user_api_keys,
-- oauth_connections) have NO policies at all, so the browser can never read them;
-- only server code using the service-role key can, after checking who is signed in.

-- ===========================================================================
-- Push notifications
-- ===========================================================================
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  device_label    text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);

create table if not exists public.notification_settings (
  user_id                     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled                     boolean not null default true,
  quiet_start                 text not null default '22:00',   -- HH:MM, Sydney time
  quiet_end                   text not null default '07:00',
  categories                  jsonb not null default '{"briefing": true, "alerts": true, "reminders": true, "cleaning": true, "money": true, "school": true}'::jsonb,
  hide_details_on_lock_screen boolean not null default false,
  allow_urgent_at_night       boolean not null default false,
  max_per_day                 integer not null default 4 check (max_per_day between 0 and 50),
  sent_day                    date,
  sent_count                  integer not null default 0,
  updated_at                  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions: all own" on public.push_subscriptions;
create policy "push_subscriptions: all own" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.notification_settings enable row level security;
drop policy if exists "notification_settings: all own" on public.notification_settings;
create policy "notification_settings: all own" on public.notification_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ===========================================================================
-- Each user's own AI keys. Encrypted (AES-256-GCM). RLS ON with NO policies:
-- the browser can never read this table. Server code reads it with the
-- service-role key, only after checking who is signed in, scoped by user_id.
-- ===========================================================================
create table if not exists public.user_api_keys (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider        text not null check (provider in ('gemini', 'groq', 'openrouter', 'mistral', 'adzuna')),
  ciphertext      text not null,
  iv              text not null,
  auth_tag        text not null,
  key_version     integer not null default 1,
  last4           text,
  status          text not null default 'unchecked' check (status in ('unchecked', 'working', 'invalid', 'rate_limited')),
  last_checked_at timestamptz,
  last_used_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, provider)
);
alter table public.user_api_keys enable row level security;
-- Deliberately no policies. Remove any that might have been added by hand:
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'user_api_keys' loop
    execute format('drop policy %I on public.user_api_keys', p.policyname);
  end loop;
end
$$;
revoke all on public.user_api_keys from anon, authenticated;

-- AI calls per user per day per provider ("shared-gemini" etc. = the site's own keys).
create table if not exists public.ai_usage (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day      date not null,
  provider text not null,
  calls    integer not null default 0,
  primary key (user_id, day, provider)
);
alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage: read own" on public.ai_usage;
create policy "ai_usage: read own" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));

-- Per-user settings used by agents and the AI.
create table if not exists public.user_settings (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  region          text,                                  -- suburb or town only
  lat             double precision,
  lng             double precision,
  timezone        text not null default 'Australia/Sydney',
  ai_daily_budget integer not null default 30 check (ai_daily_budget between 0 and 500),
  sleep_start     text not null default '22:00',
  sleep_end       text not null default '06:30',
  pay_week_start  smallint not null default 3 check (pay_week_start between 1 and 7),  -- 3 = Wednesday
  ask_before_changes boolean not null default true,
  updated_at      timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "user_settings: all own" on public.user_settings;
create policy "user_settings: all own" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ===========================================================================
-- Agents. Scheduled agents only READ the user's data and WRITE findings,
-- reports and run logs. The tick job uses the service-role key and always
-- filters by user_id.
-- ===========================================================================
create table if not exists public.agents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug            text not null,
  role            text not null default 'specialist' check (role in ('specialist', 'chief')),
  name            text not null check (char_length(name) between 1 and 24),
  description     text not null default '',
  enabled         boolean not null default true,
  schedule        jsonb not null default '{"type": "daily", "at": "07:00"}'::jsonb,
  instructions    text not null default '',
  config          jsonb not null default '{}'::jsonb,
  sources         text[] not null default '{}',
  importance_min  integer not null default 3 check (importance_min between 1 and 5),
  daily_ai_budget integer not null default 5 check (daily_ai_budget between 0 and 100),
  is_builtin      boolean not null default false,
  kind            text not null default 'custom' check (kind in ('builtin', 'custom')),
  position        jsonb,
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, slug),
  unique (id, user_id)
);
create index if not exists agents_due_idx on public.agents (next_run_at) where enabled;

create table if not exists public.agent_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id       uuid not null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running' check (status in ('running', 'ok', 'error', 'skipped')),
  ai_provider    text,
  ai_calls       integer not null default 0,
  findings_count integer not null default 0,
  error          text,
  foreign key (agent_id, user_id) references public.agents (id, user_id) on delete cascade
);
create index if not exists agent_runs_agent_idx on public.agent_runs (agent_id, started_at desc);

create table if not exists public.agent_findings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id    uuid not null,
  run_id      uuid,
  category    text not null default 'info',
  title       text not null,
  body        text not null default '',
  importance  integer not null default 3 check (importance between 1 and 5),
  dedupe_key  text not null,
  data        jsonb not null default '{}'::jsonb,
  action_url  text,
  created_at  timestamptz not null default now(),
  consumed_at timestamptz,
  expires_at  timestamptz,
  unique (user_id, agent_id, dedupe_key),
  foreign key (agent_id, user_id) references public.agents (id, user_id) on delete cascade
);
create index if not exists agent_findings_unconsumed_idx on public.agent_findings (user_id, consumed_at, created_at desc);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('briefing', 'sunday_reset', 'alert', 'strategy', 'cleaning_hours', 'custom')),
  title       text not null,
  headline    text not null default '',
  sections    jsonb not null default '[]'::jsonb,
  finding_ids uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists reports_user_created_idx on public.reports (user_id, created_at desc);

create table if not exists public.external_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source        text not null check (source in ('canvas', 'classroom')),
  external_id   text not null,
  title         text not null,
  course        text,
  due_at        timestamptz,
  url           text,
  status        text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  content_hash  text,
  unique (user_id, source, external_id)
);

do $$
declare t text;
begin
  foreach t in array array['agents', 'agent_runs', 'agent_findings', 'reports', 'external_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ': all own', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || ': all own', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end
$$;

-- ===========================================================================
-- Google and Spotify accounts. Refresh tokens are encrypted; RLS ON with NO
-- policies, so the browser can never read this table. (The older `connections`
-- table in schema.sql keeps Canvas and calendar links.)
-- ===========================================================================
create table if not exists public.oauth_connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  provider       text not null check (provider in ('google', 'spotify')),
  label          text not null default 'Personal',
  account_hint   text,
  scopes         text[] not null default '{}',
  ciphertext     text not null,
  iv             text not null,
  auth_tag       text not null,
  key_version    integer not null default 1,
  status         text not null default 'active' check (status in ('active', 'needs_reconnect', 'blocked')),
  cached         jsonb not null default '{}'::jsonb,   -- e.g. Google Calendar events from the last sync
  last_error     text,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists oauth_connections_user_idx on public.oauth_connections (user_id, provider);
alter table public.oauth_connections enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'oauth_connections' loop
    execute format('drop policy %I on public.oauth_connections', p.policyname);
  end loop;
end
$$;
revoke all on public.oauth_connections from anon, authenticated;

-- ===========================================================================
-- iPhone, Siri and Apple Calendar. Only SHA-256 hashes of tokens are stored.
-- ===========================================================================
create table if not exists public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label        text not null,
  token_hash   text not null unique,
  scope        text not null default 'read' check (scope in ('read', 'write')),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create table if not exists public.calendar_tokens (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['device_tokens', 'calendar_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ': all own', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || ': all own', t);
  end loop;
end
$$;

-- Cleaning-hours report: which jobs send a weekly hours summary.
alter table public.jobs add column if not exists weekly_hours_report boolean not null default false;

-- ===========================================================================
-- Study planner (dated blocks) and the assistant's undo log.
-- study_blocks already exists (weekly repeating blocks); dated blocks are added
-- alongside them, so old rows keep working.
-- ===========================================================================
create table if not exists public.study_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  title      text not null default 'Study plan',
  rationale  text not null default '',
  created_by text not null default 'manual' check (created_by in ('ai', 'manual')),
  status     text not null default 'active' check (status in ('active', 'replaced')),
  created_at timestamptz not null default now()
);
alter table public.study_blocks alter column day_of_week drop not null;
alter table public.study_blocks alter column start_min drop not null;
alter table public.study_blocks add column if not exists plan_id   uuid;
-- Composite key so a block can only point at its owner's own plan.
alter table public.study_blocks drop constraint if exists study_blocks_plan_fk;
alter table public.study_plans drop constraint if exists study_plans_id_user_key;
alter table public.study_plans add constraint study_plans_id_user_key unique (id, user_id);
alter table public.study_blocks add constraint study_blocks_plan_fk foreign key (plan_id, user_id) references public.study_plans (id, user_id) on delete cascade;
alter table public.study_blocks add column if not exists starts_at timestamptz;
alter table public.study_blocks add column if not exists ends_at   timestamptz;
alter table public.study_blocks add column if not exists topic     text;
alter table public.study_blocks add column if not exists kind      text not null default 'study' check (kind in ('study', 'flashcards', 'practice', 'rest'));
alter table public.study_blocks add column if not exists source    text not null default 'manual' check (source in ('ai', 'manual'));
alter table public.study_blocks add column if not exists done      boolean not null default false;
alter table public.study_blocks add column if not exists notes     text;
create index if not exists study_blocks_user_start_idx on public.study_blocks (user_id, starts_at);

create table if not exists public.assistant_actions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action      text not null,
  summary     text not null,
  created_ids jsonb not null default '{}'::jsonb,   -- {"table": ["id", ...]}
  undone_at   timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.user_settings add column if not exists max_study_min_school_day integer not null default 210;
alter table public.user_settings add column if not exists max_study_min_free_day   integer not null default 300;
alter table public.user_settings add column if not exists rest_day                 smallint not null default 7 check (rest_day between 1 and 7);

do $$
declare t text;
begin
  foreach t in array array['study_plans', 'assistant_actions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ': all own', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || ': all own', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end
$$;

-- ===========================================================================
-- Weekly budget plans (Pay & budget → Plan my week) and weekly limits.
-- budget_limits keeps one row per category; a row can now hold a monthly
-- limit, a weekly limit, or both.
-- ===========================================================================
create table if not exists public.budget_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  answers    jsonb not null default '[]'::jsonb,
  plan       jsonb not null default '{}'::jsonb,
  status     text not null default 'active' check (status in ('draft', 'active', 'replaced')),
  created_at timestamptz not null default now()
);
create index if not exists budget_plans_week_idx on public.budget_plans (user_id, week_start);

alter table public.budget_limits alter column monthly_limit_cents drop not null;
alter table public.budget_limits add column if not exists weekly_limit_cents integer check (weekly_limit_cents >= 0);

do $$
begin
  execute 'alter table public.budget_plans enable row level security';
  execute 'drop policy if exists "budget_plans: all own" on public.budget_plans';
  execute 'create policy "budget_plans: all own" on public.budget_plans for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))';
end
$$;

-- ===========================================================================
-- Coach (the 99 ATAR agent): assessment marks and saved topic guides.
-- Coach settings (target ATAR, target marks, key dates) live in the
-- school_coach agent's config.
-- ===========================================================================
create table if not exists public.assessments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course     text not null check (char_length(course) between 1 and 80),
  task       text not null check (char_length(task) between 1 and 120),
  date       date,
  weighting  numeric(5,2) check (weighting between 0 and 100),
  mark       numeric(6,2) check (mark >= 0),
  max_mark   numeric(6,2) check (max_mark > 0),
  rank       text check (char_length(rank) <= 40),
  notes      text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.study_guides (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course     text not null,
  topic      text not null,
  guide      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- Money ideas: ranked ways to earn, and a log of hours and earnings.
-- ===========================================================================
create table if not exists public.money_ideas (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type                  text not null,
  title                 text not null check (char_length(title) <= 120),
  summary               text not null default '',
  effort                smallint not null default 3 check (effort between 1 and 5),
  startup_cost_cents    integer not null default 0 check (startup_cost_cents >= 0),
  hours_per_week        numeric(4,1) not null default 2,
  est_weekly_low_cents  integer not null default 0,
  est_weekly_high_cents integer not null default 0,
  assumptions           text not null default '',
  age_legal_notes       text not null default '',
  first_steps           jsonb not null default '[]'::jsonb,
  links                 jsonb not null default '[]'::jsonb,
  score                 numeric(6,2) not null default 0,
  status                text not null default 'new' check (status in ('new', 'interested', 'trying', 'done', 'dismissed')),
  notes                 text not null default '',
  dedupe_key            text not null,
  verify                boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (user_id, dedupe_key),
  unique (id, user_id)
);

create table if not exists public.money_idea_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  idea_id      uuid not null,
  date         date not null,
  hours        numeric(5,2) not null default 0 check (hours >= 0),
  earned_cents integer not null default 0 check (earned_cents >= 0),
  note         text not null default '',
  created_at   timestamptz not null default now(),
  foreign key (idea_id, user_id) references public.money_ideas (id, user_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['assessments', 'study_guides', 'money_ideas', 'money_idea_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ': all own', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || ': all own', t);
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end
$$;
