-- 0016_flat_fee_approval.sql
-- Phase 06: the "money logic" pass from Cristian's Loom walkthrough.
--
-- Everything else he described — the flat-fee-vs-percentage partner comp model
-- (comp_mode/comp_flat/comp_pct/comp_basis), combined payout batches (spiff +
-- company lines under one ACH reference), ACH reference tracking on both
-- payouts and rev share statements, and retroactive rev share eligibility
-- (addDealToRevshareProgramme) — already existed before this migration. What
-- was missing, confirmed against 0003_deals.sql, 0009_views.sql and
-- 0010_rpcs.sql: a flat-fee partner's company cut is computed the instant a
-- deal is marked closed (transition_deal -> compute_partner_comp), and
-- record_payout sweeps every closed deal — spiff and company comp alike —
-- into the next batch automatically. There was no review step in between.
--
-- Cristian, on the Loom: a flat-fee deal "needs to come in here for a
-- one-time approval" before it pays out. Charles confirmed the scope: for a
-- flat-fee partner, nothing about a closed deal — not the rep's spiff, not
-- the company's cut — becomes payable until someone approves it once.
-- Percentage partners are unaffected; their spiff still flows the moment a
-- deal closes, same as today, and the company's cut for a pct partner is
-- reviewed monthly through the existing record_revshare deal-id selection.
--
-- Whether a deal needs this approval is snapshotted at the moment it closes
-- (requires_comp_approval), exactly like partner_comp itself — never read
-- live off the partner. A first draft of this migration checked the
-- partner's current comp_mode at query time instead, which meant flipping a
-- partner to flat-fee retroactively froze every deal they had already closed
-- under the old rate — including ones with zero company comp attached — the
-- same "later rate changes rewrite history" bug the partner_comp snapshot
-- exists to prevent (see the comment on deals.partner_comp in 0003_deals.sql).
-- Caught in testing before anything shipped; fixed here, before this ever ran
-- against real partner data.
--
-- A second, more serious bug also surfaced only under an end-to-end test:
-- record_payout (0010_rpcs.sql) computes its totals and line items by
-- reading v_payable_batch — correctly excluding an unapproved deal — but its
-- final `update deals set status = 'paid'` matched on `status = 'closed'`
-- alone, with no approval filter. Before this migration that was harmless,
-- because every closed deal was always in the payable batch. This migration
-- is the first thing that can make those two sets diverge, and left
-- unfixed, record_payout would have silently marked an unapproved deal
-- 'paid' and locked it into the batch — the rep and the company both get
-- paid for a deal nobody signed off on — while its own totals and line
-- items correctly left it out. record_payout is redefined below with the
-- same filter v_payable_batch uses, so the two can never disagree about
-- which deals a batch actually includes.

-- ---------------------------------------------------------------------------
-- The approval stamp, plus the flag that says whether one is even needed —
-- decided once, at close time, from the partner's comp_mode at that instant.
-- Both nullable/default-false — most deals (none/pct partners) never touch
-- either and are payable exactly as before.
-- ---------------------------------------------------------------------------
alter table deals add column if not exists requires_comp_approval boolean not null default false;
alter table deals add column if not exists approved_at timestamptz;
alter table deals add column if not exists approved_by uuid references profiles(id);

comment on column deals.requires_comp_approval is
  'Snapshotted by transition_deal() the instant a deal enters ''closed'', from the partner''s comp_mode at that moment — true only if it was ''flat''. Never re-derived from the partner''s current comp_mode, so switching a partner''s rate later never retroactively locks up deals that already closed under the old one.';
comment on column deals.approved_at is
  'Set once, by a one-time approval, only when requires_comp_approval is true. Until then the deal — spiff and company comp both — is held out of v_payable_batch and cannot be swept into a payout.';
comment on column deals.approved_by is
  'Who approved it, for the audit trail. Set by approve_deal_comp() only.';

-- ---------------------------------------------------------------------------
-- Reset the stamp wherever partner_comp itself already gets reset — a deal
-- pulled back out of closed (e.g. reopened into in_talks) needs its approval
-- requirement and its approval both recomputed from scratch if it closes
-- again, exactly like its comp gets recomputed from scratch.
-- ---------------------------------------------------------------------------
create or replace function public.deals_stamp_lifecycle()
returns trigger
language plpgsql
as $$
declare
  v_today date := public.partner_today(new.partner_id);
begin
  -- Entering closed: stamp the close date and snapshot the partner's cut.
  if new.status = 'closed' and coalesce(old.status, '') is distinct from 'closed' then
    if new.closed_at is null then
      new.closed_at := v_today;
    end if;
  end if;

  -- Leaving closed/paid for anything earlier: clear the close date, the
  -- snapshotted cut, and any approval state — all recomputed from scratch if
  -- the deal closes again. The original cleared the date but left the money
  -- (and, now, the approval) behind.
  if new.status in ('submitted','in_talks') then
    new.closed_at             := null;
    new.partner_comp          := 0;
    new.payout_id             := null;
    new.requires_comp_approval := false;
    new.approved_at           := null;
    new.approved_by           := null;
  end if;

  -- Lost: stamp the date, keep whatever close history existed.
  if new.status = 'lost' then
    if new.lost_at is null then
      new.lost_at := v_today;
    end if;
  else
    new.lost_at := null;
    new.lost_reason := '';
  end if;

  return new;
end $$;

-- transition_deal snapshots partner_comp every time it re-enters 'closed' —
-- do the same for requires_comp_approval (from the partner's comp_mode right
-- now, at the moment of THIS close) and reset the approval stamp alongside
-- it. This also covers the one path deals_stamp_lifecycle's reset above does
-- not: a closed -> lost -> closed round trip.
create or replace function public.transition_deal(
  p_deal_id     uuid,
  p_status      text,
  p_lost_reason text default ''
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d deals%rowtype;
  v_locked boolean;
begin
  if not public.has_cap('deals.write') then
    raise exception 'You do not have permission to move deals' using errcode = '42501';
  end if;

  select * into d from deals where id = p_deal_id;
  if not found then
    raise exception 'Deal not found' using errcode = '22023';
  end if;

  -- A deal inside a live payout batch is locked until that batch is voided.
  select exists (select 1 from payouts p
                 where p.id = d.payout_id and p.voided_at is null)
    into v_locked;
  if v_locked then
    raise exception 'This deal is part of a recorded payout. Void the payout to move it.'
      using errcode = '22023';
  end if;

  if p_status = 'lost' and coalesce(btrim(p_lost_reason), '') = '' then
    raise exception 'A reason is required to mark a deal lost' using errcode = '22023';
  end if;

  update deals
     set status      = p_status,
         lost_reason = case when p_status = 'lost' then btrim(p_lost_reason) else '' end,
         partner_comp = case when p_status = 'closed'
                             then public.compute_partner_comp(p_deal_id)
                             else partner_comp end,
         requires_comp_approval = case when p_status = 'closed'
                             then coalesce((select comp_mode = 'flat' from partners where id = d.partner_id), false)
                             else false end,
         approved_at = case when p_status = 'closed' then null else approved_at end,
         approved_by = case when p_status = 'closed' then null else approved_by end
   where id = p_deal_id;

  if p_status = 'closed' then
    perform public.emit_event(d.partner_id, 'deal_payable', jsonb_build_object(
      'deal_id',   d.id,
      'client',    d.client_name,
      'rep',       (select name  from people where id = d.person_id),
      'rep_email', (select email from people where id = d.person_id),
      'spiff',     d.spiff_amount
    ));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Column-level immutability for member edits (0008_rls.sql) — a member can
-- never touch any of these three columns either, same as partner_comp and
-- the rest.
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

  new.spiff_amount          := old.spiff_amount;
  new.partner_comp          := old.partner_comp;
  new.deal_value            := old.deal_value;
  new.monthly_value         := old.monthly_value;
  new.live                  := old.live;
  new.payout_id             := old.payout_id;
  new.closed_at             := old.closed_at;
  new.requires_comp_approval := old.requires_comp_approval;
  new.approved_at           := old.approved_at;
  new.approved_by           := old.approved_by;
  new.person_id             := old.person_id;
  new.partner_id            := old.partner_id;

  -- A member may withdraw a referral into 'in_talks' or back to 'submitted',
  -- never onwards into payable.
  if new.status not in ('submitted','in_talks') then
    raise exception 'Only the Clear Brands team can move a referral past In talks'
      using errcode = '42501';
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- approve_deal_comp — the one-time approval, gated exactly like every other
-- money RPC: has_cap('payouts.write'), same capability that gates recording
-- and voiding a payout, since this decides what a payout is allowed to sweep
-- up. Idempotent — approving an already-approved deal is a no-op, not an
-- error, so a double click can't fail loudly.
-- ---------------------------------------------------------------------------
create or replace function public.approve_deal_comp(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_status     text;
  v_requires   boolean;
  v_approved   timestamptz;
begin
  if not public.has_cap('payouts.write') then
    raise exception 'You do not have permission to approve payouts' using errcode = '42501';
  end if;

  select d.partner_id, d.status, d.requires_comp_approval, d.approved_at
    into v_partner_id, v_status, v_requires, v_approved
  from deals d
  where d.id = p_deal_id;

  if v_partner_id is null then
    raise exception 'Deal not found' using errcode = '22023';
  end if;
  if v_status <> 'closed' then
    raise exception 'Only a payable deal can be approved' using errcode = '22023';
  end if;
  if not v_requires then
    raise exception 'This deal does not need a one-time approval' using errcode = '22023';
  end if;

  if v_approved is not null then
    return;
  end if;

  update deals
     set approved_at = now(),
         approved_by = public.current_profile_id()
   where id = p_deal_id;

  perform public.emit_event(v_partner_id, 'deal_comp_approved', jsonb_build_object(
    'deal_id', p_deal_id
  ));
end $$;

revoke execute on function public.approve_deal_comp(uuid) from public;
grant execute on function public.approve_deal_comp(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- v_payable_batch — hold a deal out until its own (snapshotted) approval
-- requirement is satisfied. Everything else about the view (its columns, its
-- RLS-mirroring filter) is unchanged, so record_payout — which just reads
-- this view — needs no changes at all.
-- ---------------------------------------------------------------------------
create or replace view v_payable_batch as
  select d.partner_id,
         d.id          as deal_id,
         d.client_name,
         d.person_id,
         pe.name       as person_name,
         pe.email      as person_email,
         pe.team_id,
         t.name        as team_name,
         case when p.spiffs_enabled then d.spiff_amount else 0 end::numeric(12,2) as spiff_amount,
         d.partner_comp,
         d.closed_at
  from deals d
  join people   pe on pe.id = d.person_id
  join partners p  on p.id  = d.partner_id
  left join teams t on t.id = pe.team_id
  where d.status = 'closed'
    and (not d.requires_comp_approval or d.approved_at is not null)
    and (my_role() = 'internal'
         or (d.partner_id = my_partner_id() and has_cap('payouts.view')));

-- ---------------------------------------------------------------------------
-- v_comp_awaiting_approval — the queue: exactly the deals v_payable_batch is
-- now holding back. Same shape as v_payable_batch so the UI can reuse it.
-- ---------------------------------------------------------------------------
create or replace view v_comp_awaiting_approval as
  select d.partner_id,
         d.id          as deal_id,
         d.client_name,
         d.person_id,
         pe.name       as person_name,
         pe.email      as person_email,
         pe.team_id,
         t.name        as team_name,
         d.spiff_amount,
         d.partner_comp,
         d.closed_at
  from deals d
  join people   pe on pe.id = d.person_id
  join partners p  on p.id  = d.partner_id
  left join teams t on t.id = pe.team_id
  where d.status = 'closed'
    and d.requires_comp_approval
    and d.approved_at is null
    and (my_role() = 'internal'
         or (d.partner_id = my_partner_id() and has_cap('payouts.view')));

grant select on v_comp_awaiting_approval to authenticated;

comment on view v_comp_awaiting_approval is
  'Closed deals whose one-time approval (requires_comp_approval, snapshotted at close time) has not happened yet — held out of v_payable_batch until approve_deal_comp() runs.';

-- ---------------------------------------------------------------------------
-- record_payout — identical to 0010_rpcs.sql except the final UPDATE now
-- carries the same approval filter v_payable_batch already applies to the
-- totals and line items above it, so a deal awaiting approval can never be
-- marked paid alongside them. Every other line is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.record_payout(
  p_partner_id uuid,
  p_reference  text,
  p_paid_date  date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout_id   uuid;
  v_spiff_total numeric(12,2);
  v_comp_total  numeric(12,2);
  v_period      text;
  v_paid        date;
begin
  if not public.has_cap('payouts.write') then
    raise exception 'You do not have permission to record payouts'
      using errcode = '42501';
  end if;

  if coalesce(btrim(p_reference), '') = '' then
    raise exception 'An ACH reference is required' using errcode = '22023';
  end if;

  v_paid   := coalesce(p_paid_date, public.partner_today(p_partner_id));
  v_period := to_char(public.partner_today(p_partner_id), 'YYYY-MM');

  select coalesce(sum(spiff_amount), 0)::numeric(12,2),
         coalesce(sum(partner_comp), 0)::numeric(12,2)
    into v_spiff_total, v_comp_total
  from v_payable_batch
  where partner_id = p_partner_id;

  if v_spiff_total + v_comp_total <= 0 then
    raise exception 'Nothing is payable right now' using errcode = '22023';
  end if;

  insert into payouts (partner_id, paid_date, period, reference,
                       total, spiff_total, comp_total, created_by)
  values (p_partner_id, v_paid, v_period, btrim(p_reference),
          v_spiff_total + v_comp_total, v_spiff_total, v_comp_total,
          public.current_profile_id())
  returning id into v_payout_id;

  insert into payout_lines (payout_id, deal_id, person_id, kind, amount,
                            person_name, team_name, client_name)
  select v_payout_id, b.deal_id, b.person_id, 'spiff', b.spiff_amount,
         b.person_name, coalesce(b.team_name, ''), b.client_name
  from v_payable_batch b
  where b.partner_id = p_partner_id and b.spiff_amount > 0;

  insert into payout_lines (payout_id, deal_id, person_id, kind, amount,
                            person_name, team_name, client_name)
  select v_payout_id, b.deal_id, null, 'company', b.partner_comp,
         (select name from partners where id = p_partner_id) || ' — company earnings',
         '', b.client_name
  from v_payable_batch b
  where b.partner_id = p_partner_id and b.partner_comp > 0;

  -- Only the deals actually swept into v_payable_batch above — an unapproved
  -- deal is still `status = 'closed'` but must not be touched here.
  update deals
     set status = 'paid', payout_id = v_payout_id
   where partner_id = p_partner_id
     and status = 'closed'
     and (not requires_comp_approval or approved_at is not null);

  perform public.emit_event(p_partner_id, 'payout_recorded', jsonb_build_object(
    'total',     v_spiff_total + v_comp_total,
    'reference', btrim(p_reference),
    'month',     v_period,
    'payout_id', v_payout_id
  ));

  return v_payout_id;
exception
  when unique_violation then
    raise exception 'A payout for % is already recorded. Void it first if it needs correcting.', v_period
      using errcode = '23505';
end $$;
