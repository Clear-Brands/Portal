-- 0021_sprint_prize_slots_anon_revoke.sql
--
-- Supabase's platform-level default privileges grant EXECUTE to `anon`
-- automatically on any brand-new function (this is separate from the
-- Postgres built-in PUBLIC default that 0010/0014/0016's `revoke ... from
-- public` already handles). get_advisors flagged close_sprint/reopen_sprint
-- as callable by anon via PostgREST as a result — not exploitable in
-- practice since both immediately raise on has_cap('programs.write') for a
-- signed-out caller, but revoked explicitly here to close the gap rather
-- than lean on that. (archive_partner/restore_partner/approve_deal_comp
-- have the same latent anon grant from before this session; out of scope
-- here, left for a follow-up pass.)

revoke execute on function public.close_sprint(uuid), public.reopen_sprint(uuid) from anon;
