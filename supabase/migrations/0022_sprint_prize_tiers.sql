-- 0022_sprint_prize_tiers.sql
--
-- Cristian's updated spec (the "Updated" doc, replacing the previous one):
-- rep and pod-manager prizes are no longer one flat value per slot — each is
-- now tiered by where the POD finishes overall (winning / 2nd place / 3rd
-- place), stacked on top of the existing per-slot on/off toggle. So "1st
-- place in the 1st-place pod" can pay more than "1st place in the 3rd-place
-- pod" — a 3x3 grid for rep prizes (rep's own rank x pod's overall rank),
-- and a 1x3 row for the pod-manager prize (pod's overall rank only).
--
-- "Prizes are matched to pods by final pod rank at close-out, not by pod
-- name" — this was already true of how the app resolves prizes (off each
-- pod's computed `position`, never its name or team_id), so nothing changes
-- there; this migration only adds the columns to hold three values instead
-- of one per slot. The three enabled flags (pod_rep_1/2/3_enabled) and the
-- top-down constraint they're checked against are untouched — a rep tier is
-- still a single on/off switch across every pod, only the payout amount now
-- depends on that pod's rank.
--
-- Top rep/top pod and Top pod manager are untouched: they only ever pay the
-- #1-ranked pod, so there's no second or third tier to define for them.
--
-- Only one sprint exists in production (0020's "Summer Showdown"), so this
-- is a breaking column swap, same call as 0020 — an additive/dual-write
-- migration isn't worth it for one row.
-- ---------------------------------------------------------------------------

alter table sprints
  drop column pod_rep_1_prize,
  drop column pod_rep_2_prize,
  drop column pod_rep_3_prize,
  drop column pod_manager_prize;

alter table sprints
  add column pod_rep_1_prize_pod_1st text not null default '',
  add column pod_rep_1_prize_pod_2nd text not null default '',
  add column pod_rep_1_prize_pod_3rd text not null default '',
  add column pod_rep_2_prize_pod_1st text not null default '',
  add column pod_rep_2_prize_pod_2nd text not null default '',
  add column pod_rep_2_prize_pod_3rd text not null default '',
  add column pod_rep_3_prize_pod_1st text not null default '',
  add column pod_rep_3_prize_pod_2nd text not null default '',
  add column pod_rep_3_prize_pod_3rd text not null default '',
  add column pod_manager_prize_pod_1st text not null default '',
  add column pod_manager_prize_pod_2nd text not null default '',
  add column pod_manager_prize_pod_3rd text not null default '';

comment on column sprints.pod_rep_1_prize_pod_1st is
  'What the pod''s own #1 rep wins, when pod_rep_1_enabled and this pod finishes 1st overall.';
comment on column sprints.pod_rep_1_prize_pod_2nd is
  'What the pod''s own #1 rep wins, when pod_rep_1_enabled and this pod finishes 2nd overall.';
comment on column sprints.pod_rep_1_prize_pod_3rd is
  'What the pod''s own #1 rep wins, when pod_rep_1_enabled and this pod finishes 3rd overall. '
  'A pod finishing 4th or lower gets nothing from this slot, whichever tier column is set.';

comment on column sprints.pod_rep_2_prize_pod_1st is
  'What the pod''s own #2 rep wins, when pod_rep_2_enabled and this pod finishes 1st overall.';
comment on column sprints.pod_rep_2_prize_pod_2nd is
  'What the pod''s own #2 rep wins, when pod_rep_2_enabled and this pod finishes 2nd overall.';
comment on column sprints.pod_rep_2_prize_pod_3rd is
  'What the pod''s own #2 rep wins, when pod_rep_2_enabled and this pod finishes 3rd overall.';

comment on column sprints.pod_rep_3_prize_pod_1st is
  'What the pod''s own #3 rep wins, when pod_rep_3_enabled and this pod finishes 1st overall.';
comment on column sprints.pod_rep_3_prize_pod_2nd is
  'What the pod''s own #3 rep wins, when pod_rep_3_enabled and this pod finishes 2nd overall.';
comment on column sprints.pod_rep_3_prize_pod_3rd is
  'What the pod''s own #3 rep wins, when pod_rep_3_enabled and this pod finishes 3rd overall.';

comment on column sprints.pod_manager_prize_pod_1st is
  'Paid to every manager of a pod that finishes 1st overall, when pod_manager_enabled.';
comment on column sprints.pod_manager_prize_pod_2nd is
  'Paid to every manager of a pod that finishes 2nd overall, when pod_manager_enabled.';
comment on column sprints.pod_manager_prize_pod_3rd is
  'Paid to every manager of a pod that finishes 3rd overall, when pod_manager_enabled. '
  'A pod finishing 4th or lower gets no pod-manager prize even when this slot is on.';
