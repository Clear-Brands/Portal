-- 0010_rpcs.sql
-- The money operations, as single atomic functions.
--
-- Every total here is computed in SQL. The original calculated the payout total
-- twice — once in JavaScript for the confirmation dialog and the notification
-- email, once in SQL for the actual record — and the two could disagree on the
-- same batch. There is one number now, and it comes from the database.

-- ---------------------------------------------------------------------------
-- Event emission, in the same transaction as the change.
-- ---------------------------------------------------------------------------
create or replace function public.emit_event(
  p_partner_id uuid,
  p_event      text,
  p_payload    jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into event_outbox (partner_id, event, payload)
  values (p_partner_id, p_event,
          p_payload
            || jsonb_build_object(
                 'partner', (select name from partners where id = p_partner_id),
                 'by',      public.current_actor_name(),
                 'at',      to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- record_payout — bundle every payable deal into one batch.
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
  -- The period is the partner's current month, not the paid date. Back-dating a
  -- batch therefore cannot slip a second one past the per-month guard, which is
  -- how the original could be made to record two payouts for one month.
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

  -- Line items, snapshotted. These are never deleted or unlinked, so a void
  -- keeps its audit trail.
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

  update deals
     set status = 'paid', payout_id = v_payout_id
   where partner_id = p_partner_id and status = 'closed';

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

-- ---------------------------------------------------------------------------
-- void_payout — an entry, not an erasure.
-- ---------------------------------------------------------------------------
create or replace function public.void_payout(
  p_payout_id uuid,
  p_reason    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_partner uuid;
begin
  if not public.has_cap('payouts.write') then
    raise exception 'You do not have permission to void payouts' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to void a payout' using errcode = '22023';
  end if;

  select partner_id into v_partner from payouts
   where id = p_payout_id and voided_at is null;
  if v_partner is null then
    raise exception 'That payout does not exist or is already voided' using errcode = '22023';
  end if;

  -- Deals return to payable. payout_lines are left exactly as they are.
  update deals
     set status = 'closed', payout_id = null
   where payout_id = p_payout_id;

  update payouts
     set voided_at   = now(),
         voided_by   = public.current_profile_id(),
         void_reason = btrim(p_reason)
   where id = p_payout_id;

  perform public.emit_event(v_partner, 'payout_voided', jsonb_build_object(
    'payout_id', p_payout_id, 'reason', btrim(p_reason)));
end $$;

-- ---------------------------------------------------------------------------
-- record_revshare — the monthly statement.
-- ---------------------------------------------------------------------------
create or replace function public.record_revshare(
  p_partner_id uuid,
  p_period     text,
  p_reference  text,
  p_deal_ids   uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_pct   numeric(6,3);
  v_base  numeric(12,2);
  v_total numeric(12,2);
begin
  if not public.has_cap('revshare.write') then
    raise exception 'You do not have permission to record rev share' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reference), '') = '' then
    raise exception 'An ACH reference is required' using errcode = '22023';
  end if;
  if p_period !~ '^\d{4}-\d{2}$' then
    raise exception 'Period must look like 2026-08' using errcode = '22023';
  end if;

  select revshare_pct into v_pct from partners where id = p_partner_id;

  select coalesce(sum(monthly_value), 0)::numeric(12,2) into v_base
  from deals
  where partner_id = p_partner_id
    and id = any (p_deal_ids)
    and status in ('closed','paid')
    and monthly_value > 0
    and coalesce(live, true);

  if v_base <= 0 then
    raise exception 'No live accounts selected' using errcode = '22023';
  end if;

  v_total := public.money_round(v_base * v_pct / 100.0);

  insert into revshare_statements (partner_id, period, pct, base, total, reference, created_by)
  values (p_partner_id, p_period, v_pct, v_base, v_total, btrim(p_reference),
          public.current_profile_id())
  returning id into v_id;

  insert into revshare_lines (statement_id, deal_id, client_name, monthly_value, share)
  select v_id, d.id, d.client_name, d.monthly_value,
         public.money_round(d.monthly_value * v_pct / 100.0)
  from deals d
  where d.partner_id = p_partner_id
    and d.id = any (p_deal_ids)
    and d.status in ('closed','paid')
    and d.monthly_value > 0
    and coalesce(d.live, true);

  perform public.emit_event(p_partner_id, 'revshare_recorded', jsonb_build_object(
    'month', p_period, 'total', v_total, 'reference', btrim(p_reference), 'pct', v_pct));

  return v_id;
exception
  when unique_violation then
    raise exception 'A statement for % is already recorded. Void it first if it needs correcting.', p_period
      using errcode = '23505';
end $$;

create or replace function public.void_revshare(
  p_statement_id uuid,
  p_reason       text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_cap('revshare.write') then
    raise exception 'You do not have permission to void a statement' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  update revshare_statements
     set voided_at = now(), voided_by = public.current_profile_id(), void_reason = btrim(p_reason)
   where id = p_statement_id and voided_at is null;

  if not found then
    raise exception 'That statement does not exist or is already voided' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- transition_deal — the single guarded path for every status change.
-- In the original, four button handlers wrote status directly and skipped the
-- guards entirely. There is one door now.
-- ---------------------------------------------------------------------------
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
                             else partner_comp end
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
-- submit_deal — a member logging their own referral.
-- The spiff comes from the partner's configured rate. The caller does not get
-- to supply it, at any layer.
-- ---------------------------------------------------------------------------
create or replace function public.submit_deal(
  p_client  text,
  p_service text default '',
  p_city    text default '',
  p_state   text default '',
  p_contact text default '',
  p_phone   text default '',
  p_email   text default '',
  p_note    text default ''
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person  uuid := public.my_person_id();
  v_partner uuid := public.my_partner_id();
  v_id      uuid;
begin
  if v_person is null or v_partner is null or not public.my_is_active() then
    raise exception 'Your portal access is not active' using errcode = '42501';
  end if;
  if coalesce(btrim(p_client), '') = '' then
    raise exception 'A client name is required' using errcode = '22023';
  end if;

  insert into deals (partner_id, person_id, client_name, service,
                     city, state, contact, phone, email, promo_note,
                     status, spiff_amount)
  values (v_partner, v_person, btrim(p_client), coalesce(p_service, ''),
          coalesce(p_city, ''), upper(coalesce(p_state, '')), coalesce(p_contact, ''),
          coalesce(p_phone, ''), coalesce(p_email, ''), coalesce(p_note, ''),
          'submitted',
          (select default_spiff from partners where id = v_partner))
  returning id into v_id;

  perform public.emit_event(v_partner, 'deal_submitted', jsonb_build_object(
    'deal_id', v_id,
    'client',  btrim(p_client),
    'rep',     (select name from people where id = v_person)));

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Only signed-in sessions may call these. The functions do their own checks.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.record_payout(uuid, text, date),
  public.void_payout(uuid, text),
  public.record_revshare(uuid, text, text, uuid[]),
  public.void_revshare(uuid, text),
  public.transition_deal(uuid, text, text),
  public.submit_deal(text, text, text, text, text, text, text, text),
  public.emit_event(uuid, text, jsonb)
from public;

grant execute on function
  public.record_payout(uuid, text, date),
  public.void_payout(uuid, text),
  public.record_revshare(uuid, text, text, uuid[]),
  public.void_revshare(uuid, text),
  public.transition_deal(uuid, text, text),
  public.submit_deal(text, text, text, text, text, text, text, text)
to authenticated;
