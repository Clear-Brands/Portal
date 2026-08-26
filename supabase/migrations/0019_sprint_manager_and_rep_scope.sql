-- 0019_sprint_manager_and_rep_scope.sql
--
-- Two fixes from Cristian's second Loom walkthrough, both about 'winner'
-- (one-ladder) sprints specifically:
--
-- 1. prize_manager was exactly the same dead-field bug 0017 fixed for
--    'perteam' sprints' team_prizes.mgr, just left unfixed on this side: the
--    form collects "Winning pod's manager" and saves it, the card even prints
--    it back ("Manager prize: $300"), but listPrizeLines() only ever read
--    team_prizes.mgr for a 'perteam' sprint — a 'winner' sprint's manager
--    prize never became a PrizeLine, so it never showed up on /programs/prizes,
--    the export, or anywhere a person could see they're actually owed it.
--    Fixed in the app layer (listPrizeLines), not here — but it needs the
--    winning pod's manager(s) resolved, which is already computed for every
--    sprint regardless of type (see listSprints' managersByTeam), so no
--    schema change is needed for this half.
--
-- 2. "Sometimes we'll just have a prize for maybe the winning pod, and it's
--    number 1 salesman and their manager" — today a 'winner' sprint's rep
--    prizes (prize_rep_1/2/3) always pay the top individuals across the
--    WHOLE sprint (v_sprint_overall), regardless of which pod they're on —
--    demonstrated live on the Summer Showdown example where a rep from the
--    pod that placed 2nd still won the individual prize. Cristian wants an
--    option where the rep prize is scoped to the winning pod's own top rep
--    instead. rep_prize_scope carries that choice; 'sprint_wide' keeps
--    today's behaviour as the default, 'winning_pod' is the new one.
alter table sprints add column if not exists rep_prize_scope text not null default 'sprint_wide'
  check (rep_prize_scope in ('sprint_wide', 'winning_pod'));

comment on column sprints.rep_prize_scope is
  '''winner'' sprints only. ''sprint_wide'' (default): prize_rep_1/2/3 pay the
   top 3 individuals across every pod in the sprint (v_sprint_overall).
   ''winning_pod'': prize_rep_1/2/3 instead pay only the #1-ranked pod''s own
   top 3 reps (v_sprint_team_reps, filtered to that one pod) — for when the
   individual prize is meant to travel with the winning pod, not the sprint''s
   overall leaderboard. Ignored for ''perteam'' sprints, which already rank
   every pod''s reps independently via team_prizes.';

-- v_sprint_team_reps (0017) only computed for 'perteam' sprints — the
-- 'winning_pod' rep scope above needs the same per-pod ranking for 'winner'
-- sprints too, so the sprint_type filter comes off. Nothing downstream that
-- already reads this view is affected: a 'perteam' sprint's own rows are
-- identical to before, this only adds rows for 'winner' sprints that no
-- existing query was reading.
create or replace view v_sprint_team_reps as
  select *
  from (
    select sp.id     as sprint_id,
           sp.partner_id,
           c.person_id,
           pe.name   as person_name,
           pe.team_id,
           t.name    as team_name,
           count(*)                           as closes,
           sum(c.spiff_amount)::numeric(12,2) as spiff,
           rank() over (partition by sp.id, c.team_id
                        order by count(*) desc, sum(c.spiff_amount) desc, pe.name) as position,
           sp.visible
    from sprints sp
    join v_closes c on c.partner_id = sp.partner_id
                   and c.team_id = any (sp.team_ids)
                   and c.closed_at between sp.start_date and sp.end_date
    join people pe on pe.id = c.person_id
    join teams  t  on t.id  = c.team_id
    group by sp.id, sp.partner_id, c.person_id, pe.name, pe.team_id, c.team_id, t.name, sp.visible
  ) ranked
  where position <= 3
    and (my_role() = 'internal'
         or (partner_id = my_partner_id() and visible and has_cap('competitions.view')));

grant select on v_sprint_team_reps to authenticated;
