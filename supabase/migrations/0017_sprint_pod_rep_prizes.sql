-- 0017_sprint_pod_rep_prizes.sql
--
-- Cristian's ask on the Loom walkthrough: sprint prizes should be "1st rep,
-- 2nd rep (optional), 3rd rep (optional), and the pod's manager, for every
-- pod" — a genuinely per-pod structure, not one prize riding on whichever pod
-- wins the sprint outright.
--
-- 'perteam' sprints already stored exactly that shape in team_prizes jsonb
-- ({team_id: {c1, c2, c3, mgr}} — see 0005_programs.sql), but the app read it
-- wrong: c1/c2/c3 were paid out based on the POD's own rank against every
-- other pod in the sprint (v_sprint_team_standings' `position`), so a pod that
-- finished 2nd overall could never trigger its own "c1" prize even if its top
-- rep individually outsold everyone. And `mgr` was collected on the form and
-- saved to the row, then never read anywhere — a prize nobody could ever see
-- was owed.
--
-- v_sprint_overall already ranks reps sprint-wide, but is capped to the
-- global top 3 (position <= 3 inside its own definition) — for a multi-pod
-- 'perteam' sprint that starves every pod but the one or two producing the
-- overall leaders. This view instead ranks reps within their own pod, so
-- every pod gets its own 1st/2nd/3rd regardless of how the other pods did.
create view v_sprint_team_reps as
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
    where sp.sprint_type = 'perteam'
    group by sp.id, sp.partner_id, c.person_id, pe.name, pe.team_id, c.team_id, t.name, sp.visible
  ) ranked
  where position <= 3
    and (my_role() = 'internal'
         or (partner_id = my_partner_id() and visible and has_cap('competitions.view')));

grant select on v_sprint_team_reps to authenticated;

comment on column sprints.team_prizes is
  '''perteam'' mode only: {team_id: {c1, c2, c3, mgr}}. c1/c2/c3 pay the pod''s
   own 1st/2nd/3rd rep (v_sprint_team_reps ranks within the pod, not against
   other pods — 2nd and 3rd are meant to be left blank when a pod is too small
   to want them). mgr pays every person listed in that pod''s teams.manager_ids.';
