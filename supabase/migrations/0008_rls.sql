-- 0008_rls.sql
-- Row-level security on every table.
--
-- This is the second line of defence, not the first: the browser never holds a
-- key that can write, and all mutations go through server actions that check
-- capabilities before touching anything. These policies are what catches a bug
-- in that layer.
--
-- The headline fix is the member insert policy on deals. In the original, the
-- equivalent rule constrained who, what status, and which partner — but not the
-- money. Anyone could POST a referral with a $100,000 spiff attached. Here the
-- amount must equal the partner's configured rate, and every other money column
-- must be zero.

alter table partners            enable row level security;
alter table departments         enable row level security;
alter table teams               enable row level security;
alter table people              enable row level security;
alter table profiles            enable row level security;
alter table deals               enable row level security;
alter table payouts             enable row level security;
alter table payout_lines        enable row level security;
alter table revshare_statements enable row level security;
alter table revshare_lines      enable row level security;
alter table competitions        enable row level security;
alter table sprints             enable row level security;
alter table annual_goals        enable row level security;
alter table goal_awards         enable row level security;
alter table activity            enable row level security;
alter table event_outbox        enable row level security;
alter table webhook_events      enable row level security;

-- ===========================================================================
-- partners
-- ===========================================================================
create policy partners_read on partners for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active())
    or id = my_partner_id()
  );

create policy partners_write on partners for all to authenticated
  using      (my_role() = 'internal' and has_cap('partners.write'))
  with check (my_role() = 'internal' and has_cap('partners.write'));

-- Rate changes are a separate capability from partner administration.
create policy partners_rates on partners for update to authenticated
  using      (my_role() = 'internal' and has_cap('rates.write'))
  with check (my_role() = 'internal' and has_cap('rates.write'));

-- ===========================================================================
-- departments / teams
-- ===========================================================================
create policy departments_read on departments for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active())
    or partner_id = my_partner_id()
  );

create policy departments_write on departments for all to authenticated
  using      (my_role() = 'internal' and has_cap('people.write'))
  with check (my_role() = 'internal' and has_cap('people.write'));

create policy teams_read on teams for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active())
    or partner_id = my_partner_id()
  );

create policy teams_write on teams for all to authenticated
  using      (my_role() = 'internal' and has_cap('people.write'))
  with check (my_role() = 'internal' and has_cap('people.write'));

-- ===========================================================================
-- people
-- ===========================================================================
create policy people_read on people for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active())
    or (partner_id = my_partner_id() and my_is_active())
  );

create policy people_write_internal on people for all to authenticated
  using      (my_role() = 'internal' and has_cap('people.write'))
  with check (my_role() = 'internal' and has_cap('people.write'));

create policy people_write_partner_admin on people for insert to authenticated
  with check (
    my_role() = 'partner_admin'
    and partner_id = my_partner_id()
    and has_cap('people.write')
    and kind = 'rep'
  );

create policy people_update_partner_admin on people for update to authenticated
  using      (my_role() = 'partner_admin' and partner_id = my_partner_id() and has_cap('people.write'))
  with check (my_role() = 'partner_admin' and partner_id = my_partner_id());

-- Pod managers may hire into and edit their own pods only, and only if their
-- person-level grant says so. In the original this grant was cosmetic: the
-- policy let any listed pod manager write regardless of perms.
create policy people_write_pod_manager on people for insert to authenticated
  with check (
    my_role() = 'member'
    and has_pod_cap('pod.people.write')
    and partner_id = my_partner_id()
    and kind = 'rep'
    and team_id in (select my_managed_team_ids())
  );

create policy people_update_pod_manager on people for update to authenticated
  using (
    my_role() = 'member'
    and has_pod_cap('pod.people.write')
    and team_id in (select my_managed_team_ids())
  )
  with check (
    kind = 'rep'
    and team_id in (select my_managed_team_ids())
  );

-- ===========================================================================
-- profiles
-- ===========================================================================
create policy profiles_read_own on profiles for select to authenticated
  using (user_id = auth.uid());

create policy profiles_read_internal on profiles for select to authenticated
  using (my_role() = 'internal' and my_is_active());

create policy profiles_read_partner_admin on profiles for select to authenticated
  using (my_role() = 'partner_admin' and partner_id = my_partner_id() and my_is_active());

create policy profiles_write_internal on profiles for all to authenticated
  using      (my_role() = 'internal' and has_cap('people.write'))
  with check (my_role() = 'internal' and has_cap('people.write'));

-- A partner admin may adjust their own members' grants, never elevate a role.
create policy profiles_update_partner_admin on profiles for update to authenticated
  using (
    my_role() = 'partner_admin'
    and partner_id = my_partner_id()
    and role = 'member'
    and has_cap('people.write')
  )
  with check (
    partner_id = my_partner_id()
    and role = 'member'
    and access = 'none'
  );

-- ===========================================================================
-- deals
-- ===========================================================================
create policy deals_read_internal on deals for select to authenticated
  using (my_role() = 'internal' and my_is_active());

create policy deals_read_partner_admin on deals for select to authenticated
  using (my_role() = 'partner_admin' and partner_id = my_partner_id() and my_is_active());

create policy deals_read_own on deals for select to authenticated
  using (
    my_role() = 'member'
    and my_is_active()
    and partner_id = my_partner_id()
    and person_id = my_person_id()
  );

-- Pod managers see their pods' deals.
create policy deals_read_pod_manager on deals for select to authenticated
  using (
    my_role() = 'member'
    and has_pod_cap('pod.numbers.view')
    and partner_id = my_partner_id()
    and person_id in (
      select id from people where team_id in (select my_managed_team_ids())
    )
  );

create policy deals_write_internal on deals for all to authenticated
  using      (my_role() = 'internal' and has_cap('deals.write'))
  with check (my_role() = 'internal' and has_cap('deals.write'));

-- The important one. A member may log a referral for themselves, and nothing else.
create policy deals_insert_own on deals for insert to authenticated
  with check (
    my_role() = 'member'
    and my_is_active()
    and partner_id = my_partner_id()
    and person_id  = my_person_id()
    and status     = 'submitted'
    -- Money is not the submitter's to set.
    and spiff_amount = (select default_spiff from partners where id = partner_id)
    and partner_comp  = 0
    and deal_value    = 0
    and monthly_value = 0
    and payout_id  is null
    and closed_at  is null
    and lost_at    is null
  );

-- A member may correct the details of their own pre-payable referral.
--
-- Note what is NOT here: a subquery reading `deals` to compare the old spiff.
-- A policy on a table that queries that same table recurses, so column
-- immutability is enforced by the trigger below instead — which is stronger
-- anyway, because it cannot be bypassed by any code path at all.
create policy deals_update_own on deals for update to authenticated
  using (
    my_role() = 'member'
    and my_is_active()
    and person_id = my_person_id()
    and status in ('submitted','in_talks')
  )
  with check (
    person_id = my_person_id()
    and status in ('submitted','in_talks')
    and partner_comp = 0
    and payout_id is null
  );

-- ---------------------------------------------------------------------------
-- Column-level immutability for member edits.
--
-- A member editing their own referral may change the client detail and nothing
-- else. Rather than trusting a policy expression, this pins every protected
-- column back to its previous value, so even a direct UPDATE that satisfies the
-- policy cannot move the money.
-- ---------------------------------------------------------------------------
create or replace function public.deals_guard_member_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only constrains members. Internal staff go through transition_deal(),
  -- which does its own capability checks.
  if coalesce(public.my_role(), '') <> 'member' then
    return new;
  end if;

  new.spiff_amount  := old.spiff_amount;
  new.partner_comp  := old.partner_comp;
  new.deal_value    := old.deal_value;
  new.monthly_value := old.monthly_value;
  new.live          := old.live;
  new.payout_id     := old.payout_id;
  new.closed_at     := old.closed_at;
  new.person_id     := old.person_id;
  new.partner_id    := old.partner_id;

  -- A member may withdraw a referral into 'in_talks' or back to 'submitted',
  -- never onwards into payable.
  if new.status not in ('submitted','in_talks') then
    raise exception 'Only the Clear Brands team can move a referral past In talks'
      using errcode = '42501';
  end if;

  return new;
end $$;

create trigger deals_guard_member_edit
  before update on deals
  for each row execute function public.deals_guard_member_edit();

-- ===========================================================================
-- payouts and their lines
-- ===========================================================================
create policy payouts_read_internal on payouts for select to authenticated
  using (my_role() = 'internal' and my_is_active());

create policy payouts_read_partner on payouts for select to authenticated
  using (
    my_role() in ('partner_admin','member')
    and partner_id = my_partner_id()
    and my_is_active()
    and has_cap('payouts.view')
  );

create policy payouts_write on payouts for all to authenticated
  using      (my_role() = 'internal' and has_cap('payouts.write'))
  with check (my_role() = 'internal' and has_cap('payouts.write'));

create policy payout_lines_read on payout_lines for select to authenticated
  using (exists (select 1 from payouts p where p.id = payout_id));

create policy payout_lines_write on payout_lines for all to authenticated
  using      (my_role() = 'internal' and has_cap('payouts.write'))
  with check (my_role() = 'internal' and has_cap('payouts.write'));

-- ===========================================================================
-- rev share
-- ===========================================================================
create policy revshare_read_internal on revshare_statements for select to authenticated
  using (my_role() = 'internal' and has_cap('revshare.view'));

create policy revshare_read_partner on revshare_statements for select to authenticated
  using (
    my_role() = 'partner_admin'
    and partner_id = my_partner_id()
    and my_is_active()
    and has_cap('revshare.view')
  );

create policy revshare_write on revshare_statements for all to authenticated
  using      (my_role() = 'internal' and has_cap('revshare.write'))
  with check (my_role() = 'internal' and has_cap('revshare.write'));

create policy revshare_lines_read on revshare_lines for select to authenticated
  using (exists (select 1 from revshare_statements s where s.id = statement_id));

create policy revshare_lines_write on revshare_lines for all to authenticated
  using      (my_role() = 'internal' and has_cap('revshare.write'))
  with check (my_role() = 'internal' and has_cap('revshare.write'));

-- ===========================================================================
-- programmes
-- ===========================================================================
create policy competitions_read on competitions for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active())
    or (partner_id = my_partner_id() and visible and my_is_active() and has_cap('competitions.view'))
  );

create policy competitions_write on competitions for all to authenticated
  using      (my_role() = 'internal' and has_cap('programs.write'))
  with check (my_role() = 'internal' and has_cap('programs.write'));

create policy sprints_read on sprints for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active())
    or (partner_id = my_partner_id() and visible and my_is_active() and has_cap('competitions.view'))
  );

create policy sprints_write on sprints for all to authenticated
  using      (my_role() = 'internal' and has_cap('programs.write'))
  with check (my_role() = 'internal' and has_cap('programs.write'));

create policy annual_goals_read on annual_goals for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active())
    or (partner_id = my_partner_id() and my_is_active())
  );

create policy annual_goals_write on annual_goals for all to authenticated
  using      (my_role() = 'internal' and has_cap('programs.write'))
  with check (my_role() = 'internal' and has_cap('programs.write'));

create policy goal_awards_read on goal_awards for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active())
    or (partner_id = my_partner_id() and my_is_active())
  );

-- Approving a prize is a money decision.
create policy goal_awards_write on goal_awards for all to authenticated
  using      (my_role() = 'internal' and has_cap('payouts.write'))
  with check (my_role() = 'internal' and has_cap('payouts.write'));

-- ===========================================================================
-- activity — append only, Clear Brands eyes plus partner admins who hold the grant
-- ===========================================================================
create policy activity_read on activity for select to authenticated
  using (
    (my_role() = 'internal' and my_is_active() and has_cap('activity.view'))
    or (my_role() = 'partner_admin' and partner_id = my_partner_id()
        and my_is_active() and has_cap('activity.view'))
  );

-- No insert policy: rows arrive only through SECURITY DEFINER triggers.
-- No update or delete policy anywhere, by design.

-- ===========================================================================
-- events — server-side only, never reachable from a session
-- ===========================================================================
create policy event_outbox_read on event_outbox for select to authenticated
  using (my_role() = 'internal' and my_is_active());

create policy webhook_events_read on webhook_events for select to authenticated
  using (my_role() = 'internal' and my_is_active());
