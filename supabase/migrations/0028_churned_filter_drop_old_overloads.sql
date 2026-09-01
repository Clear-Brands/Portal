-- 0028_churned_filter_drop_old_overloads.sql
--
-- Hotfix for a live incident 0027 caused. 0027 used `create or replace
-- function` to append p_churned onto filtered_deals / search_deals /
-- summarise_deals / deal_status_counts. Postgres decides whether "or
-- replace" replaces an existing function or creates a new one by comparing
-- the exact parameter type signature — adding a parameter changes the
-- signature, so each of those four calls created a second overload
-- alongside the original instead of replacing it. (0024 and 0026 got this
-- right for search_deals by dropping the old signature first — 0027 didn't
-- follow that pattern for any of the four.)
--
-- With both overloads present, any call that omits p_churned — which is
-- exactly what the app currently deployed in production makes on every
-- /deals, /deals/pipeline, and summary request — became ambiguous between
-- the two candidates and started failing with "function ... is not unique".
-- This was caught live (via direct RPC calls against production, not from
-- the app, since the app carrying p_churned isn't deployed yet) shortly
-- after 0027 shipped and hotfixed by dropping the old-signature overloads
-- directly against the live database. This migration is that same hotfix,
-- committed so a fresh migration replay from 0001 ends up in the same
-- state as production rather than reintroducing the bug.
--
-- After this, a call that omits p_churned resolves unambiguously to the
-- p_churned-aware version and gets its default (null = unfiltered) — same
-- behaviour the app had before 0027, just through one function instead of
-- two.

drop function if exists public.filtered_deals(uuid, text, uuid, uuid, date, date, text, text);
drop function if exists public.search_deals(uuid, text, uuid, uuid, date, date, text, text, text, int, int);
drop function if exists public.summarise_deals(uuid, text, uuid, uuid, date, date, text, text);
drop function if exists public.deal_status_counts(uuid);
