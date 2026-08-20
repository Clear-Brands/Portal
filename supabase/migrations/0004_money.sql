-- 0004_money.sql
-- The ledger: spiff payout batches and monthly rev-share statements.
--
-- The original stored a payout's composition as a jsonb blob and, on void,
-- nulled deals.payout_id — which destroyed the record of what had been in the
-- voided batch. Here every batch has real line items that are never unlinked.
-- A void is an entry, not an erasure.

-- ---------------------------------------------------------------------------
-- payouts — one ACH transfer to a partner
-- ---------------------------------------------------------------------------
create table payouts (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references partners(id) on delete restrict,

  paid_date    date not null,
  period       text not null,                 -- 'YYYY-MM', the month this batch settles
  reference    text not null check (length(btrim(reference)) > 0),

  total        numeric(12,2) not null check (total >= 0),
  spiff_total  numeric(12,2) not null default 0 check (spiff_total >= 0),
  comp_total   numeric(12,2) not null default 0 check (comp_total  >= 0),

  voided_at    timestamptz,
  voided_by    uuid references profiles(id) on delete set null,
  void_reason  text not null default '',

  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint payouts_total_adds_up check (total = spiff_total + comp_total),
  constraint payouts_void_needs_reason check (
    voided_at is null or length(btrim(void_reason)) > 0
  )
);

create index payouts_partner_idx on payouts (partner_id, paid_date desc);

-- One live batch per partner per period, enforced by the database rather than
-- by a browser check the way the original did it. Voided batches drop out of
-- the index, so a corrected batch can be re-recorded for the same month.
create unique index payouts_one_live_per_period
  on payouts (partner_id, period)
  where voided_at is null;

comment on column payouts.period is
  'The settlement month, YYYY-MM. Derived from the partner''s timezone, and independent of paid_date
   so back-dating a batch cannot slip a second one past the per-month guard.';

alter table deals
  add constraint deals_payout_fk
  foreign key (payout_id) references payouts(id) on delete set null;

-- ---------------------------------------------------------------------------
-- payout_lines — the permanent composition of a batch
-- ---------------------------------------------------------------------------
create table payout_lines (
  id          uuid primary key default gen_random_uuid(),
  payout_id   uuid not null references payouts(id) on delete cascade,
  deal_id     uuid references deals(id) on delete set null,
  person_id   uuid references people(id) on delete set null,

  kind        text not null check (kind in ('spiff','company')),
  amount      numeric(12,2) not null check (amount >= 0),

  -- Snapshots, so an export of a two-year-old batch still reads correctly even
  -- if the person was renamed, moved team, or left.
  person_name text not null default '',
  team_name   text not null default '',
  client_name text not null default '',

  created_at  timestamptz not null default now(),

  constraint payout_lines_spiff_has_person check (
    kind <> 'spiff' or person_id is not null
  )
);

create index payout_lines_payout_idx on payout_lines (payout_id);
create index payout_lines_person_idx on payout_lines (person_id);
create index payout_lines_deal_idx   on payout_lines (deal_id);

comment on table payout_lines is
  'Never deleted, never unlinked. Voiding a batch leaves these rows intact so the audit trail survives.';

-- ---------------------------------------------------------------------------
-- revshare_statements — the monthly revenue share owed to a partner
-- ---------------------------------------------------------------------------
create table revshare_statements (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete restrict,

  period      text not null,                  -- 'YYYY-MM'
  pct         numeric(6,3) not null check (pct >= 0 and pct <= 100),
  base        numeric(12,2) not null check (base  >= 0),
  total       numeric(12,2) not null check (total >= 0),
  reference   text not null check (length(btrim(reference)) > 0),

  voided_at   timestamptz,
  voided_by   uuid references profiles(id) on delete set null,
  void_reason text not null default '',

  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint revshare_void_needs_reason check (
    voided_at is null or length(btrim(void_reason)) > 0
  )
);

create index revshare_partner_idx on revshare_statements (partner_id, period desc);

-- Same guard as payouts, and likewise enforced here rather than in the browser.
create unique index revshare_one_live_per_period
  on revshare_statements (partner_id, period)
  where voided_at is null;

create table revshare_lines (
  id            uuid primary key default gen_random_uuid(),
  statement_id  uuid not null references revshare_statements(id) on delete cascade,
  deal_id       uuid references deals(id) on delete set null,

  client_name   text not null default '',
  monthly_value numeric(12,2) not null check (monthly_value >= 0),
  share         numeric(12,2) not null check (share >= 0),

  created_at    timestamptz not null default now()
);

create index revshare_lines_statement_idx on revshare_lines (statement_id);
create index revshare_lines_deal_idx      on revshare_lines (deal_id);
