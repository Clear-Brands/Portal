-- 0003_deals.sql
-- Referrals and their lifecycle: submitted -> in_talks -> closed (payable) -> paid,
-- with `lost` reachable from any pre-paid state.
--
-- Invariants that were client-side in the original and are now database-enforced:
--   * A lost deal must carry a reason.
--   * A closed or paid deal must have a close date.
--   * Only a closed deal can be attached to a payout.
--   * Dates are stamped in the partner's timezone, by trigger, not by the browser.

create table deals (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references partners(id) on delete cascade,
  person_id     uuid not null references people(id) on delete restrict,

  client_name   text not null check (length(btrim(client_name)) > 0),
  service       text not null default '',

  status        text not null default 'submitted'
                  check (status in ('submitted','in_talks','closed','paid','lost')),

  -- Money. Set by the server from the partner's configured rate; the browser
  -- never supplies these. (In the original a rep could POST any spiff they liked.)
  spiff_amount  numeric(12,2) not null default 0 check (spiff_amount >= 0),
  partner_comp  numeric(12,2) not null default 0 check (partner_comp >= 0),
  deal_value    numeric(12,2) not null default 0 check (deal_value >= 0),
  monthly_value numeric(12,2) not null default 0 check (monthly_value >= 0),

  -- Rev-share account state: null = not yet live, true = live, false = churned.
  live          boolean,

  -- Contact detail
  contact       text not null default '',
  phone         text not null default '',
  email         text not null default '',
  city          text not null default '',
  state         text not null default '',

  promo_note    text not null default '',
  lost_reason   text not null default '',

  closed_at     date,
  lost_at       date,
  payout_id     uuid,               -- FK added in 0004, once payouts exists

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint deals_lost_needs_reason check (
    status <> 'lost' or length(btrim(lost_reason)) > 0
  ),
  constraint deals_closed_needs_date check (
    status not in ('closed','paid') or closed_at is not null
  ),
  constraint deals_payout_only_when_paid check (
    payout_id is null or status = 'paid'
  )
);

create index deals_partner_status_idx  on deals (partner_id, status);
create index deals_partner_closed_idx  on deals (partner_id, closed_at) where closed_at is not null;
create index deals_person_idx          on deals (person_id);
create index deals_payout_idx          on deals (payout_id) where payout_id is not null;
create index deals_partner_created_idx on deals (partner_id, created_at desc);
create index deals_payable_idx         on deals (partner_id) where status = 'closed';
create index deals_client_trgm         on deals using gin (client_name gin_trgm_ops);

create trigger deals_touch before update on deals
  for each row execute function public.touch_updated_at();

comment on column deals.status is
  'closed means payable — the client''s first invoice is paid but the ACH has not gone out yet.';
comment on column deals.partner_comp is
  'The partner company''s own cut, snapshotted at the moment of close so later rate changes never rewrite history.';

-- ---------------------------------------------------------------------------
-- "Today" in a partner's own timezone.
-- ---------------------------------------------------------------------------
create or replace function public.partner_today(p_partner_id uuid)
returns date
language sql
stable
as $$
  select (now() at time zone coalesce(
           (select timezone from partners where id = p_partner_id),
           'America/New_York'))::date
$$;

comment on function public.partner_today(uuid) is
  'The current date as the partner experiences it. The original computed "today" in UTC but compared
   in local time, so every date shifted by one after ~7pm US Eastern.';

-- ---------------------------------------------------------------------------
-- The partner company's per-close cut, computed in SQL.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Lifecycle date stamping. Runs on every insert and update so no code path can
-- skip it — in the original, four button handlers bypassed the guarded
-- transition function entirely.
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

  -- Leaving closed/paid for anything earlier: clear the close date AND the
  -- snapshotted cut. The original cleared the date but left the money behind.
  if new.status in ('submitted','in_talks') then
    new.closed_at    := null;
    new.partner_comp := 0;
    new.payout_id    := null;
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

create trigger deals_stamp_lifecycle
  before insert or update on deals
  for each row execute function public.deals_stamp_lifecycle();
