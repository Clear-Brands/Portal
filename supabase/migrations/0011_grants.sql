-- 0011_grants.sql
-- Explicit table privileges.
--
-- Supabase grants broadly to anon/authenticated by default. Being explicit here
-- means the privilege surface is reviewable in the repository rather than
-- inherited from platform defaults — and it lets the RLS test suite run against
-- a bare PostgreSQL instance with the same grants production has.
--
-- `anon` gets nothing. Every read in this application happens through a
-- signed-in server-side session; there is no public data.

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Reference data and the roster: read for any signed-in session, filtered by RLS.
grant select on
  partners, departments, teams, people, profiles,
  competitions, sprints, annual_goals, goal_awards,
  payouts, payout_lines, revshare_statements, revshare_lines,
  activity, event_outbox, webhook_events
to authenticated;

-- Tables a session may write to, always subject to the policies in 0008.
grant insert, update on
  partners, departments, teams, people, profiles,
  competitions, sprints, annual_goals, goal_awards,
  payouts, payout_lines, revshare_statements, revshare_lines
to authenticated;

grant select, insert, update on deals to authenticated;

-- Deletions are a Clear Brands action on programme rows only. Nothing that
-- records money or history is ever deletable from a session.
grant delete on competitions, sprints, annual_goals to authenticated;

-- The server-side worker identity.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

comment on schema public is
  'Deletions on deals, payouts, payout_lines, revshare_* and activity are granted to no session role. '
  'The ledger is append-only by privilege, not merely by convention.';
