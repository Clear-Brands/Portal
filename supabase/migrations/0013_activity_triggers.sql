-- 0013_activity_triggers.sql
-- Activity coverage for phase 03: rev share, roster and programmes.
--
-- 0006_activity_events.sql wired up 'deal' and 'money' (payouts) logging and
-- left 'team', 'program' and the rest of 'money' (rev share) as bare check-
-- constraint values with nothing writing them. The rule from 0006 still
-- applies here: every one of these is an AFTER trigger, so a failed write
-- never leaves a log line behind, and there is still no insert policy on
-- activity for any session role — these functions are SECURITY DEFINER for
-- exactly that reason.

-- ---------------------------------------------------------------------------
-- Rev share
-- ---------------------------------------------------------------------------
create or replace function public.log_revshare_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner text;
  v_msg     text;
begin
  select name into v_partner from partners where id = new.partner_id;

  if tg_op = 'INSERT' then
    v_msg := format('Rev share recorded — %s from %s (ref %s)',
                    to_char(new.total, 'FM$999,999,990.00'), v_partner, new.reference);
  elsif old.voided_at is null and new.voided_at is not null then
    v_msg := format('Rev share voided — %s from %s (ref %s) — %s',
                    to_char(new.total, 'FM$999,999,990.00'), v_partner, new.reference, new.void_reason);
  else
    return null;
  end if;

  insert into activity (partner_id, kind, text, actor_id, actor_name, entity_table, entity_id)
  values (new.partner_id, 'money', v_msg,
          public.current_profile_id(), public.current_actor_name(), 'revshare_statements', new.id);

  return null;
end $$;

create trigger revshare_log_activity
  after insert or update on revshare_statements
  for each row execute function public.log_revshare_activity();

-- ---------------------------------------------------------------------------
-- Roster — additions and pauses. Edits to name/email/pod are not logged; the
-- moments worth an audit line are someone joining and someone's access
-- pausing, which is the one roster fact that matters for "why did their
-- earned money stop showing as new activity."
-- ---------------------------------------------------------------------------
create or replace function public.log_people_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_msg text;
begin
  if tg_op = 'INSERT' then
    v_msg := format('Member added — %s', new.name);
  elsif old.active is distinct from new.active then
    v_msg := format('%s — %s', case when new.active then 'Member reactivated' else 'Member deactivated' end, new.name);
  else
    return null;
  end if;

  insert into activity (partner_id, kind, text, actor_id, actor_name, entity_table, entity_id)
  values (new.partner_id, 'team', v_msg,
          public.current_profile_id(), public.current_actor_name(), 'people', new.id);

  return null;
end $$;

create trigger people_log_activity
  after insert or update on people
  for each row execute function public.log_people_activity();

-- ---------------------------------------------------------------------------
-- Portal logins — the roster's "enable a portal login" action, and every
-- other profile a login gets created for.
-- ---------------------------------------------------------------------------
create or replace function public.log_access_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity (partner_id, kind, text, actor_id, actor_name, entity_table, entity_id)
  values (new.partner_id, 'access', format('Portal login enabled — %s', new.name),
          public.current_profile_id(), public.current_actor_name(), 'profiles', new.id);
  return null;
end $$;

create trigger profiles_log_activity
  after insert on profiles
  for each row execute function public.log_access_activity();

-- ---------------------------------------------------------------------------
-- Programmes — competitions, sprints and annual goals, one function each
-- since each table's prize shape is different. Phase 02 wrote these tables
-- with plain inserts, so this starts logging retroactively with no changes
-- needed there — the trigger fires on the table, not on the call site.
-- ---------------------------------------------------------------------------
create or replace function public.log_competition_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity (partner_id, kind, text, actor_id, actor_name, entity_table, entity_id)
  values (new.partner_id, 'program', format('Competition launched — %s', new.name),
          public.current_profile_id(), public.current_actor_name(), 'competitions', new.id);
  return null;
end $$;

create trigger competitions_log_activity
  after insert on competitions
  for each row execute function public.log_competition_activity();

create or replace function public.log_sprint_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity (partner_id, kind, text, actor_id, actor_name, entity_table, entity_id)
  values (new.partner_id, 'program',
          format('Sprint launched — %s (%s pods competing)', new.name, coalesce(array_length(new.team_ids, 1), 0)),
          public.current_profile_id(), public.current_actor_name(), 'sprints', new.id);
  return null;
end $$;

create trigger sprints_log_activity
  after insert on sprints
  for each row execute function public.log_sprint_activity();

create or replace function public.log_annual_goal_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity (partner_id, kind, text, actor_id, actor_name, entity_table, entity_id)
  values (new.partner_id, 'program',
          format('Annual goal set — %s closes by %s', new.target, new.end_date),
          public.current_profile_id(), public.current_actor_name(), 'annual_goals', new.id);
  return null;
end $$;

create trigger annual_goals_log_activity
  after insert on annual_goals
  for each row execute function public.log_annual_goal_activity();
