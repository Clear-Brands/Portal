-- 0015_closers_club_and_titles.sql
-- Phase 05: edits from Cristian's Loom walkthrough of the live portal.
--
-- Two independent changes:
--
--  1. Display titles. The org chart he walked through (sales rep, sales pod
--     manager, director of sales, CS rep, CS pod manager, director of CS,
--     account managers, accounting, C-level) is not a new permission tier —
--     the capability grid already grants or revokes anything per login
--     (src/lib/auth/capabilities.ts, PermissionGridButton). What was missing
--     was a label. A free-text title on profiles and people is that label;
--     it is never read by has_cap(), has_pod_cap() or any RLS policy below —
--     changing it changes nothing about what a login can do.
--
--  2. Annual goals ("Closers Club" in the interface from here on) get the
--     same multi-pod selection sprints already have (team_id -> team_ids),
--     and a real partner-wide "only one running at a time" guard. The old
--     unique index only blocked an exact duplicate (partner, team, start
--     date) — two different pods' goals, or two overlapping date ranges,
--     could already both be active. Cristian: "I only want there to be one
--     annual Closers Club competition going on at a time."

-- ---------------------------------------------------------------------------
-- Titles
-- ---------------------------------------------------------------------------
alter table profiles add column title text;
alter table people   add column title text;

comment on column profiles.title is
  'Free-text job title for display only (e.g. "Director of Sales", "Accounting"). Not read by has_cap() or any policy — permissions are still role/access + perms.';
comment on column people.title is
  'Free-text job title for display only, same as profiles.title.';

-- ---------------------------------------------------------------------------
-- annual_goals: one pod -> many pods
-- ---------------------------------------------------------------------------
alter table annual_goals add column team_ids uuid[] not null default '{}';

update annual_goals
   set team_ids = case when team_id is not null then array[team_id] else '{}'::uuid[] end;

drop index if exists annual_goals_one_per_scope;

-- v_annual_goal_standings (0009_views.sql) still reads annual_goals.team_id —
-- it has to be redefined against team_ids before the column drop below, or
-- Postgres refuses the drop ("other objects depend on it").
create or replace view v_annual_goal_standings as
  select g.id        as goal_id,
         g.partner_id,
         g.target,
         g.prize,
         g.start_date,
         g.end_date,
         pe.id       as person_id,
         pe.name     as person_name,
         pe.team_id,
         coalesce(agg.closes, 0)                       as closes,
         (coalesce(agg.closes, 0) >= g.target)         as achieved,
         greatest(g.target - coalesce(agg.closes, 0), 0) as remaining,
         (ga.id is not null)                           as approved,
         ga.approved_at
  from annual_goals g
  join people pe on pe.partner_id = g.partner_id
                and pe.kind = 'rep'
                and (array_length(g.team_ids, 1) is null or pe.team_id = any (g.team_ids))
  left join lateral (
    select count(*) as closes
    from v_closes c
    where c.person_id = pe.id
      and c.closed_at between g.start_date and g.end_date
  ) agg on true
  left join goal_awards ga on ga.goal_id = g.id and ga.person_id = pe.id
  where my_role() = 'internal' or g.partner_id = my_partner_id();

alter table annual_goals drop column team_id;

create index annual_goals_teams_idx on annual_goals using gin (team_ids);

comment on column annual_goals.team_ids is
  'Empty array = every pod for the partner. Mirrors sprints.team_ids.';

-- ---------------------------------------------------------------------------
-- annual_goals: one active Closers Club per partner, full stop — not per pod.
-- btree_gist lets one exclusion constraint combine plain equality (partner_id)
-- with a range-overlap check (the date window).
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist;

alter table annual_goals
  add constraint annual_goals_one_active_per_partner
  exclude using gist (partner_id with =, daterange(start_date, end_date, '[]') with &&);

comment on constraint annual_goals_one_active_per_partner on annual_goals is
  'Enforces "only one Closers Club running at a time" partner-wide, regardless of which pod(s) it targets — a same-partner insert whose date range overlaps an existing row is refused by Postgres, not just by the app.';

-- ---------------------------------------------------------------------------
-- v_person_stats: add the new title column so the roster can show and edit
-- it without a second round trip. Same create-or-replace reasoning as below.
-- ---------------------------------------------------------------------------
-- `create or replace view` only allows new output columns to be appended at
-- the end — inserting `title` earlier in the list would fail with "cannot
-- change name of view column" — so it goes on last, after open_deals.
create or replace view v_person_stats as
  select pe.id            as person_id,
         pe.partner_id,
         pe.team_id,
         pe.name,
         pe.email,
         pe.kind,
         pe.active,
         t.name           as team_name,
         t.color          as team_color,
         coalesce(agg.deals_sent, 0)                    as deals_sent,
         coalesce(agg.closes, 0)                        as closes,
         case when coalesce(agg.deals_sent, 0) = 0 then 0
              else round(100.0 * agg.closes / agg.deals_sent, 1) end as close_ratio,
         coalesce(agg.spiff_earned, 0)::numeric(12,2)   as spiff_earned,
         coalesce(agg.spiff_payable, 0)::numeric(12,2)  as spiff_payable,
         coalesce(agg.open_deals, 0)                    as open_deals,
         pe.title
  from people pe
  left join teams t on t.id = pe.team_id
  left join lateral (
    select count(*)                                                          as deals_sent,
           count(*) filter (where d.status in ('closed','paid'))             as closes,
           sum(d.spiff_amount) filter (where d.status = 'paid')              as spiff_earned,
           sum(d.spiff_amount) filter (where d.status = 'closed')            as spiff_payable,
           count(*) filter (where d.status in ('submitted','in_talks'))      as open_deals
    from deals d where d.person_id = pe.id
  ) agg on true
  where my_role() = 'internal' or pe.partner_id = my_partner_id();
