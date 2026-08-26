-- 0020_sprint_prize_slots.sql
--
-- Cristian's "Partner Sales Sprint — Competition and Prize Structure" doc: a
-- full rebuild of how a sprint's prizes are configured and how a sprint ends.
--
-- Two things change, and neither was possible before:
--
-- 1. Prizes are six fixed, independently-toggleable slots — not the old
--    winner/perteam mode split (sprint_type, rep_prize_scope, team_prizes
--    jsonb) that made "1st/2nd/3rd in every pod, same prize each time, plus
--    a manager prize that isn't only for the winner" impossible to express
--    at all. Every pod gets identical rep tiers when a tier is on (no
--    per-pod customization anymore — the doc is explicit that the same
--    prize applies to Pod 1, 2 and 3 alike), rep tiers fill top-down (no
--    2nd place without a 1st), and "Pod Manager" pays every pod's manager
--    unconditionally while "Top Pod Manager" pays only the #1 pod's.
--    Only one sprint exists in the database as of this migration (seed
--    data), so this is a clean replacement, not an additive one.
--
-- 2. A sprint no longer closes itself. "The end date shown on the
--    leaderboard is a target, not an auto-cutoff" — so the live standings
--    below are windowed by start_date only, no upper bound, and keep moving
--    until an admin calls close_sprint(), which freezes the exact standings
--    at that moment into sprint_pod_results / sprint_rep_results. Every
--    read after that comes from the freeze, not from deals that might still
--    change (a reopened deal, a correction) after the fact. reopen_sprint()
--    is the undo — not asked for in the doc, but a manual one-way action on
--    real prize money deserves one, the same way Void exists for a payout.
--
-- Tie-breaking changes too: "whoever reached their closed deal count first
-- wins the higher spot" replaces the old spiff-amount tiebreak. deals.closed_at
-- is a date, not a timestamp, so "first" resolves to whichever side's final
-- close landed on the earlier date — max(closed_at) ascending, falling back
-- to name only when even that ties.

-- ---------------------------------------------------------------------------
-- The old sprint views go first — they reference columns this migration drops.
-- ---------------------------------------------------------------------------
drop view if exists v_sprint_overall;
drop view if exists v_sprint_team_reps;
drop view if exists v_sprint_team_standings;

-- ---------------------------------------------------------------------------
-- sprints — drop the winner/perteam prize model, add the six-slot one.
-- ---------------------------------------------------------------------------
alter table sprints
  drop column if exists sprint_type,
  drop column if exists rep_prize_scope,
  drop column if exists prize_team_1,
  drop column if exists prize_team_2,
  drop column if exists prize_team_3,
  drop column if exists prize_rep_1,
  drop column if exists prize_rep_2,
  drop column if exists prize_rep_3,
  drop column if exists prize_manager,
  drop column if exists team_prizes;

alter table sprints
  add column pod_rep_1_enabled       boolean not null default false,
  add column pod_rep_1_prize         text    not null default '',
  add column pod_rep_2_enabled       boolean not null default false,
  add column pod_rep_2_prize         text    not null default '',
  add column pod_rep_3_enabled       boolean not null default false,
  add column pod_rep_3_prize         text    not null default '',
  add column pod_manager_enabled     boolean not null default false,
  add column pod_manager_prize       text    not null default '',
  add column top_rep_top_pod_enabled boolean not null default false,
  add column top_rep_top_pod_prize   text    not null default '',
  add column top_pod_manager_enabled boolean not null default false,
  add column top_pod_manager_prize   text    not null default '',
  add column closed_at timestamptz,
  add column closed_by uuid references profiles(id) on delete set null;

alter table sprints add constraint sprints_rep_tiers_top_down check (
  (not pod_rep_2_enabled or pod_rep_1_enabled) and
  (not pod_rep_3_enabled or pod_rep_2_enabled)
);

comment on column sprints.pod_rep_1_enabled is
  'Per-pod rep prizes (all optional, top-down: no 2nd without a 1st, no 3rd
   without a 2nd). When on, the same pod_rep_N_prize pays whichever rep ranks
   Nth inside EVERY participating pod — identically for Pod 1, Pod 2, Pod 3
   and so on, not a different prize per pod.';
comment on column sprints.pod_manager_enabled is
  'Pays every participating pod''s manager(s) the same prize, unconditionally
   — not tied to rank. "Managers Only" (no rep prizes, just this) is a valid
   configuration on its own.';
comment on column sprints.top_rep_top_pod_enabled is
  'Cross-pod: pays only the #1-ranked pod''s own #1 rep (v_sprint_rep_standings
   position 1 within whichever team_id ranks position 1 in
   v_sprint_pod_standings) — a single winner, not a ladder.';
comment on column sprints.top_pod_manager_enabled is
  'Cross-pod: pays only the #1-ranked pod''s manager(s) — the pod-scoped
   counterpart to top_rep_top_pod_enabled.';
comment on column sprints.closed_at is
  'Null while the sprint is still running — standings are computed live, with
   no upper bound at end_date (a target, not a cutoff). Once set, the
   standings that were live at that instant are frozen in sprint_pod_results
   / sprint_rep_results and every read comes from there instead.';

-- ---------------------------------------------------------------------------
-- sprint_pod_results / sprint_rep_results — what close_sprint() freezes.
--
-- Names, colors and manager rosters are snapshotted alongside the numbers:
-- a pod renamed or a manager reassigned after a sprint closes should not
-- silently rewrite who a already-finalized prize sheet says won what.
-- ---------------------------------------------------------------------------
create table sprint_pod_results (
  id            uuid primary key default gen_random_uuid(),
  sprint_id     uuid not null references sprints(id) on delete cascade,
  partner_id    uuid not null references partners(id) on delete cascade,
  team_id       uuid not null references teams(id) on delete cascade,
  team_name     text not null,
  team_color    text not null,
  manager_ids   uuid[] not null default '{}',
  manager_names text[] not null default '{}',
  closes        int not null default 0,
  spiff         numeric(12,2) not null default 0,
  tiebreak_at   date,
  position      int not null,
  created_at    timestamptz not null default now(),
  unique (sprint_id, team_id)
);
create index sprint_pod_results_sprint_idx on sprint_pod_results (sprint_id);

create table sprint_rep_results (
  id           uuid primary key default gen_random_uuid(),
  sprint_id    uuid not null references sprints(id) on delete cascade,
  partner_id   uuid not null references partners(id) on delete cascade,
  team_id      uuid not null references teams(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  person_name  text not null,
  closes       int not null default 0,
  spiff        numeric(12,2) not null default 0,
  tiebreak_at  date,
  position     int not null,
  created_at   timestamptz not null default now(),
  unique (sprint_id, person_id)
);
create index sprint_rep_results_sprint_idx on sprint_rep_results (sprint_id);

alter table sprint_pod_results enable row level security;
alter table sprint_rep_results enable row level security;

create policy sprint_pod_results_read on sprint_pod_results for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active())
    or (partner_id = my_partner_id() and my_is_active() and has_cap('competitions.view')
        and exists (select 1 from sprints sp where sp.id = sprint_id and sp.visible))
  );

create policy sprint_rep_results_read on sprint_rep_results for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active())
    or (partner_id = my_partner_id() and my_is_active() and has_cap('competitions.view')
        and exists (select 1 from sprints sp where sp.id = sprint_id and sp.visible))
  );

-- Read-only from a session's point of view — the only writer is
-- close_sprint()/reopen_sprint() below, running as security definer.
grant select on sprint_pod_results, sprint_rep_results to authenticated;
grant all on sprint_pod_results, sprint_rep_results to service_role;

-- ---------------------------------------------------------------------------
-- Live standings for a sprint still running (closed_at is null). Building
-- blocks only — not granted directly, the same way v_closes isn't (0009).
-- ---------------------------------------------------------------------------
create view v_sprint_pod_live as
  select sp.id      as sprint_id,
         sp.partner_id,
         sp.name    as sprint_name,
         t.id       as team_id,
         t.name     as team_name,
         t.color    as team_color,
         t.manager_ids,
         coalesce(mgr.names, '{}') as manager_names,
         coalesce(agg.closes, 0)                        as closes,
         coalesce(agg.spiff, 0)::numeric(12,2)          as spiff,
         agg.tiebreak_at,
         rank() over (partition by sp.id
                      order by coalesce(agg.closes, 0) desc,
                               agg.tiebreak_at asc nulls last, t.name)  as position,
         false as is_closed
  from sprints sp
  join teams t on t.id = any (sp.team_ids)
  left join lateral (
    select count(*) as closes, sum(c.spiff_amount) as spiff, max(c.closed_at) as tiebreak_at
    from v_closes c
    where c.team_id = t.id and c.closed_at >= sp.start_date
  ) agg on true
  left join lateral (
    select array_agg(pe.name order by pe.name) as names
    from people pe where pe.id = any (t.manager_ids)
  ) mgr on true
  where sp.closed_at is null
    and (my_role() = 'internal'
         or (sp.partner_id = my_partner_id() and sp.visible and has_cap('competitions.view')));

create view v_sprint_rep_live as
  select *
  from (
    select sp.id     as sprint_id,
           sp.partner_id,
           c.team_id,
           pe.id     as person_id,
           pe.name   as person_name,
           count(*)                           as closes,
           sum(c.spiff_amount)::numeric(12,2) as spiff,
           max(c.closed_at)                   as tiebreak_at,
           rank() over (partition by sp.id, c.team_id
                        order by count(*) desc, max(c.closed_at) asc, pe.name) as position,
           false as is_closed,
           sp.visible,
           sp.closed_at as sprint_closed_at
    from sprints sp
    join v_closes c on c.partner_id = sp.partner_id
                   and c.team_id = any (sp.team_ids)
                   and c.closed_at >= sp.start_date
    join people pe on pe.id = c.person_id
    group by sp.id, sp.partner_id, c.team_id, pe.id, pe.name, sp.visible, sp.closed_at
  ) ranked
  where position <= 3
    and sprint_closed_at is null
    and (my_role() = 'internal'
         or (partner_id = my_partner_id() and visible and has_cap('competitions.view')));

-- ---------------------------------------------------------------------------
-- The views the app actually reads: live rows for a running sprint, frozen
-- rows for a closed one, same shape either way so nothing downstream needs
-- to know which sprint is which.
-- ---------------------------------------------------------------------------
create view v_sprint_pod_standings as
  select sprint_id, partner_id, sprint_name, team_id, team_name, team_color,
         manager_ids, manager_names, closes, spiff, tiebreak_at, position, is_closed
  from v_sprint_pod_live
  union all
  select r.sprint_id, r.partner_id, sp.name, r.team_id, r.team_name, r.team_color,
         r.manager_ids, r.manager_names, r.closes, r.spiff, r.tiebreak_at, r.position, true
  from sprint_pod_results r
  join sprints sp on sp.id = r.sprint_id
  where my_role() = 'internal'
     or (r.partner_id = my_partner_id() and sp.visible and has_cap('competitions.view'));

create view v_sprint_rep_standings as
  select sprint_id, partner_id, team_id, person_id, person_name,
         closes, spiff, tiebreak_at, position, is_closed
  from v_sprint_rep_live
  union all
  select r.sprint_id, r.partner_id, r.team_id, r.person_id, r.person_name,
         r.closes, r.spiff, r.tiebreak_at, r.position, true
  from sprint_rep_results r
  join sprints sp on sp.id = r.sprint_id
  where my_role() = 'internal'
     or (r.partner_id = my_partner_id() and sp.visible and has_cap('competitions.view'));

grant select on v_sprint_pod_standings, v_sprint_rep_standings to authenticated;

-- ---------------------------------------------------------------------------
-- close_sprint — freezes whatever the live standings say right now.
-- ---------------------------------------------------------------------------
create or replace function public.close_sprint(p_sprint_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sp sprints%rowtype;
begin
  if not public.has_cap('programs.write') then
    raise exception 'You do not have permission to close a sprint' using errcode = '42501';
  end if;

  select * into sp from sprints where id = p_sprint_id;
  if not found then
    raise exception 'Sprint not found' using errcode = '22023';
  end if;
  if sp.closed_at is not null then
    raise exception 'This sprint is already closed' using errcode = '22023';
  end if;

  insert into sprint_pod_results
    (sprint_id, partner_id, team_id, team_name, team_color,
     manager_ids, manager_names, closes, spiff, tiebreak_at, position)
  select sp.id, sp.partner_id, t.id, t.name, t.color,
         t.manager_ids,
         coalesce((select array_agg(pe.name order by pe.name)
                   from people pe where pe.id = any (t.manager_ids)), '{}'),
         coalesce(agg.closes, 0),
         coalesce(agg.spiff, 0)::numeric(12,2),
         agg.tiebreak_at,
         rank() over (order by coalesce(agg.closes, 0) desc,
                                agg.tiebreak_at asc nulls last, t.name)
  from teams t
  left join lateral (
    select count(*) as closes, sum(c.spiff_amount) as spiff, max(c.closed_at) as tiebreak_at
    from v_closes c
    where c.team_id = t.id and c.closed_at >= sp.start_date
  ) agg on true
  where t.id = any (sp.team_ids);

  insert into sprint_rep_results
    (sprint_id, partner_id, team_id, person_id, person_name, closes, spiff, tiebreak_at, position)
  select sp.id, sp.partner_id, team_id, person_id, person_name, closes, spiff, tiebreak_at, position
  from (
    select c.team_id, pe.id as person_id, pe.name as person_name,
           count(*)                           as closes,
           sum(c.spiff_amount)::numeric(12,2) as spiff,
           max(c.closed_at)                   as tiebreak_at,
           rank() over (partition by c.team_id
                        order by count(*) desc, max(c.closed_at) asc, pe.name) as position
    from v_closes c
    join people pe on pe.id = c.person_id
    where c.partner_id = sp.partner_id
      and c.team_id = any (sp.team_ids)
      and c.closed_at >= sp.start_date
    group by c.team_id, pe.id, pe.name
  ) ranked
  where position <= 3;

  update sprints set closed_at = now(), closed_by = public.current_profile_id()
   where id = p_sprint_id;
end $$;

-- ---------------------------------------------------------------------------
-- reopen_sprint — the undo. Not in the spec, but a one-way freeze on real
-- prize money is exactly the kind of mistake worth a correction path for
-- (see: Void on a payout).
-- ---------------------------------------------------------------------------
create or replace function public.reopen_sprint(p_sprint_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_cap('programs.write') then
    raise exception 'You do not have permission to reopen a sprint' using errcode = '42501';
  end if;

  delete from sprint_pod_results where sprint_id = p_sprint_id;
  delete from sprint_rep_results where sprint_id = p_sprint_id;

  update sprints set closed_at = null, closed_by = null where id = p_sprint_id;
  if not found then
    raise exception 'Sprint not found' using errcode = '22023';
  end if;
end $$;

revoke execute on function public.close_sprint(uuid), public.reopen_sprint(uuid) from public;
grant  execute on function public.close_sprint(uuid), public.reopen_sprint(uuid) to authenticated;
