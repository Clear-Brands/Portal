-- 0005_programs.sql
-- The four incentive systems: individual competitions, team-vs-team sprints,
-- windowed closing goals, and the prize approvals that hang off goals.
--
-- Rules the original form enforced but the database did not — a minimum of one
-- close to qualify, an end date after the start, at least two teams in a
-- sprint — are constraints here.

-- ---------------------------------------------------------------------------
-- competitions — individuals racing each other
-- ---------------------------------------------------------------------------
create table competitions (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete cascade,
  team_id     uuid references teams(id) on delete cascade,   -- null = everyone

  name        text not null check (length(btrim(name)) > 0),
  start_date  date not null,
  end_date    date not null,

  prize_1     text not null default '',
  prize_2     text not null default '',
  prize_3     text not null default '',

  min_closes  int not null default 1 check (min_closes >= 1),
  visible     boolean not null default true,

  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint competitions_window check (end_date >= start_date)
);

create index competitions_partner_idx on competitions (partner_id, start_date desc);
create index competitions_team_idx    on competitions (team_id);
create trigger competitions_touch before update on competitions
  for each row execute function public.touch_updated_at();

comment on column competitions.min_closes is
  'At least one. Reps below the bar still appear on the board but no prize attaches to them.';

-- ---------------------------------------------------------------------------
-- sprints — teams racing each other
-- ---------------------------------------------------------------------------
create table sprints (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references partners(id) on delete cascade,

  name           text not null check (length(btrim(name)) > 0),
  start_date     date not null,
  end_date       date not null,

  sprint_type    text not null default 'winner' check (sprint_type in ('winner','perteam')),
  team_ids       uuid[] not null default '{}',

  -- 'winner' mode: one prize ladder for the whole sprint
  prize_team_1   text not null default '',
  prize_team_2   text not null default '',
  prize_team_3   text not null default '',
  prize_rep_1    text not null default '',
  prize_rep_2    text not null default '',
  prize_rep_3    text not null default '',
  prize_manager  text not null default '',

  -- 'perteam' mode: {team_id: {c1, c2, c3, mgr}}
  team_prizes    jsonb not null default '{}'::jsonb,

  visible        boolean not null default true,

  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint sprints_window check (end_date >= start_date),
  constraint sprints_need_two_teams check (array_length(team_ids, 1) >= 2)
);

create index sprints_partner_idx on sprints (partner_id, start_date desc);
create index sprints_teams_idx   on sprints using gin (team_ids);
create trigger sprints_touch before update on sprints
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- annual_goals — hit a close count inside a window, win the prize
-- ---------------------------------------------------------------------------
create table annual_goals (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete cascade,
  team_id     uuid references teams(id) on delete cascade,   -- null = everyone

  start_date  date not null,
  end_date    date not null,
  target      int not null check (target >= 1),
  prize       text not null default '',

  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint annual_goals_window check (end_date >= start_date)
);

create index annual_goals_partner_idx on annual_goals (partner_id, start_date desc);

-- One active goal per scope at a time. The original silently updated in place;
-- this makes the intent explicit and stops two overlapping goals for one team.
create unique index annual_goals_one_per_scope
  on annual_goals (partner_id, coalesce(team_id, '00000000-0000-0000-0000-000000000000'::uuid), start_date);

create trigger annual_goals_touch before update on annual_goals
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- goal_awards — a queued prize, approved by a human before anything is owed
-- ---------------------------------------------------------------------------
create table goal_awards (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references partners(id) on delete cascade,
  goal_id      uuid not null references annual_goals(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,

  approved_at  date not null,
  approved_by  uuid references profiles(id) on delete set null,
  approved_by_name text not null default '',

  created_at   timestamptz not null default now(),

  unique (goal_id, person_id)
);

create index goal_awards_partner_idx on goal_awards (partner_id);
create index goal_awards_person_idx  on goal_awards (person_id);
