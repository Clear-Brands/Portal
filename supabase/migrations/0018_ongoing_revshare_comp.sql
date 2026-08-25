-- 0018_ongoing_revshare_comp.sql
--
-- Cristian's ask on the Loom walkthrough: a third partner payout type,
-- "Percentage of Ongoing Rev Share" — instead of a one-time flat fee or a
-- one-time percentage of the deal, this partner earns an ongoing monthly cut
-- of the deal's monthly value, through the exact same "Ongoing Monthly"
-- statement 'revshare_statements' already bills (see 0004_money.sql /
-- record_revshare in 0010_rpcs.sql). The rate is the partner's existing
-- revshare_pct — there is no new percentage field, because that number
-- already means "the ongoing monthly cut", it just wasn't reachable from a
-- comp_mode before.
--
-- Reuses the flat-fee approval machinery from 0016_flat_fee_approval.sql
-- wholesale rather than inventing a parallel review flow: a deal closing
-- under this comp mode holds (requires_comp_approval = true, same column,
-- same "Awaiting approval" queue on /payouts) until someone signs off once,
-- exactly like a flat-fee deal's company cut does today. A second snapshot
-- column, ongoing_revshare, records *why* the hold exists — flat-fee holds
-- for a one-time payout amount, this holds so the deal isn't opted into
-- deals.live (and therefore a monthly bill) without a human looking at it
-- first. approve_deal_comp() now does that opt-in itself, so approving here
-- is the same one action that used to require going to /revshare and using
-- "Add to programme" by hand.
--
-- compute_partner_comp keeps returning 0 for this mode, same as 'none' — the
-- company's cut is not a payout line item under this mode, it is entirely a
-- revshare_statements line, computed monthly from deals.live + monthly_value
-- exactly as it already is for every partner using the rev-share programme.

alter table partners drop constraint partners_comp_mode_check;
alter table partners add constraint partners_comp_mode_check
  check (comp_mode in ('none','flat','pct','ongoing_pct'));

alter table deals add column if not exists ongoing_revshare boolean not null default false;

comment on column deals.ongoing_revshare is
  'Snapshotted by transition_deal() the instant a deal enters ''closed'', from the partner''s comp_mode at that moment — true only if it was ''ongoing_pct''. Alongside requires_comp_approval, this tells approve_deal_comp() to opt the deal into the ongoing rev-share programme (deals.live = true) rather than — or in addition to, if the rep also earns a spiff — a one-time payout line.';

comment on column partners.comp_mode is
  '''none'': no partner comp. ''flat''/''pct'': a one-time company cut per close, computed by compute_partner_comp() and paid through payouts. ''ongoing_pct'': no one-time cut — instead, once approved, the deal joins the same ongoing monthly rev-share programme revshare_statements already bills at revshare_pct.';

create or replace function public.compute_partner_comp(p_deal_id uuid)
returns numeric(12,2)
language sql
stable
as $$
  select case p.comp_mode
           when 'flat' then public.money_round(p.comp_flat)
           when 'pct'  then public.money_round(
                              case p.comp_basis
                                when 'contract' then d.deal_value
                                else coalesce(nullif(d.monthly_value, 0), d.deal_value)
                              end * p.comp_pct / 100.0)
           else 0::numeric(12,2)
         end
  from deals d
  join partners p on p.id = d.partner_id
  where d.id = p_deal_id
$$;

create or replace function public.deals_stamp_lifecycle()
returns trigger
language plpgsql
as $$
declare
  v_today date := public.partner_today(new.partner_id);
begin
  if new.status = 'closed' and coalesce(old.status, '') is distinct from 'closed' then
    if new.closed_at is null then
      new.closed_at := v_today;
    end if;
  end if;

  if new.status in ('submitted','in_talks') then
    new.closed_at             := null;
    new.partner_comp          := 0;
    new.payout_id             := null;
    new.requires_comp_approval := false;
    new.approved_at           := null;
    new.approved_by           := null;
    new.ongoing_revshare      := false;
  end if;

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

-- transition_deal: requires_comp_approval now also covers 'ongoing_pct',
-- and ongoing_revshare is snapshotted the same way requires_comp_approval
-- already is — both from the partner's comp_mode at the instant THIS close
-- happens, never re-derived later.
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
  v_comp_mode text;
begin
  if not public.has_cap('deals.write') then
    raise exception 'You do not have permission to move deals' using errcode = '42501';
  end if;

  select * into d from deals where id = p_deal_id;
  if not found then
    raise exception 'Deal not found' using errcode = '22023';
  end if;

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

  select comp_mode into v_comp_mode from partners where id = d.partner_id;

  update deals
     set status      = p_status,
         lost_reason = case when p_status = 'lost' then btrim(p_lost_reason) else '' end,
         partner_comp = case when p_status = 'closed'
                             then public.compute_partner_comp(p_deal_id)
                             else partner_comp end,
         requires_comp_approval = case when p_status = 'closed'
                             then coalesce(v_comp_mode in ('flat','ongoing_pct'), false)
                             else false end,
         ongoing_revshare = case when p_status = 'closed'
                             then coalesce(v_comp_mode = 'ongoing_pct', false)
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

create or replace function public.deals_guard_member_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
  new.ongoing_revshare      := old.ongoing_revshare;
  new.person_id             := old.person_id;
  new.partner_id            := old.partner_id;

  if new.status not in ('submitted','in_talks') then
    raise exception 'Only the Clear Brands team can move a referral past In talks'
      using errcode = '42501';
  end if;

  return new;
end $$;

-- v_payable_batch and v_comp_awaiting_approval both now also carry
-- monthly_value and revshare_pct, so the "awaiting approval" queue can show
-- what an ongoing_pct deal will actually start accruing, instead of the
-- (always zero, for this mode) company comp.
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
         d.closed_at,
         d.ongoing_revshare,
         d.monthly_value,
         p.revshare_pct
  from deals d
  join people   pe on pe.id = d.person_id
  join partners p  on p.id  = d.partner_id
  left join teams t on t.id = pe.team_id
  where d.status = 'closed'
    and (not d.requires_comp_approval or d.approved_at is not null)
    and (my_role() = 'internal'
         or (d.partner_id = my_partner_id() and has_cap('payouts.view')));

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
         d.closed_at,
         d.ongoing_revshare,
         d.monthly_value,
         p.revshare_pct
  from deals d
  join people   pe on pe.id = d.person_id
  join partners p  on p.id  = d.partner_id
  left join teams t on t.id = pe.team_id
  where d.status = 'closed'
    and d.requires_comp_approval
    and d.approved_at is null
    and (my_role() = 'internal'
         or (d.partner_id = my_partner_id() and has_cap('payouts.view')));

-- approve_deal_comp: unchanged gate and audit trail, plus the one new
-- consequence — an ongoing_pct deal needs a monthly value to accrue anything,
-- checked before the approval is recorded (not after), and opts the deal
-- into the rev-share programme the same way the "Add to programme" button on
-- /revshare always has (deals.live = true). A deal already live is left
-- alone, so re-approving (should the row ever be revisited) can't undo a
-- manual churn.
create or replace function public.approve_deal_comp(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id   uuid;
  v_status       text;
  v_requires     boolean;
  v_approved     timestamptz;
  v_ongoing      boolean;
  v_monthly      numeric(12,2);
begin
  if not public.has_cap('payouts.write') then
    raise exception 'You do not have permission to approve payouts' using errcode = '42501';
  end if;

  select d.partner_id, d.status, d.requires_comp_approval, d.approved_at,
         d.ongoing_revshare, d.monthly_value
    into v_partner_id, v_status, v_requires, v_approved, v_ongoing, v_monthly
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

  if v_ongoing and coalesce(v_monthly, 0) <= 0 then
    raise exception 'This deal needs a monthly value first — set one from the Rev share page, then approve here.'
      using errcode = '22023';
  end if;

  update deals
     set approved_at = now(),
         approved_by = public.current_profile_id()
   where id = p_deal_id;

  if v_ongoing then
    update deals set live = true where id = p_deal_id and live is distinct from true;
  end if;

  perform public.emit_event(v_partner_id, 'deal_comp_approved', jsonb_build_object(
    'deal_id', p_deal_id
  ));
end $$;
