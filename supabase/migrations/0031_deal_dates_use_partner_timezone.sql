-- 0031_deal_dates_use_partner_timezone.sql
--
-- Found live: a deal FieldPulse's rep submitted at 2026-09-02 02:20 UTC (a
-- few minutes after 10pm Eastern on Sept 1 — FieldPulse's timezone) showed
-- up on the rep's own /my-deals but not on /deals for either the FieldPulse
-- partner admin or the Clear Brands internal view. Root cause: filtered_deals()
-- has compared its date-window bounds against `d.created_at::date` since it
-- was first written (0012) -- a bare timestamptz-to-date cast, which Postgres
-- resolves in the *session's* timezone (UTC here), not the partner's. The app
-- side already learned this lesson once (see the comment on resolveWindow()
-- in filters.ts, and partner_today() below, both computing "today" in the
-- partner's own timezone) but the SQL side of the same comparison never
-- matched it -- `p_to` arrives as a partner-local date, then gets compared
-- against a UTC-local one. For anyone in a timezone behind UTC (all of the
-- US), any deal submitted after the partner's local midnight-to-UTC's-own-
-- midnight gap -- realistically every evening, roughly 5 combined at
-- Eastern's laggiest, longer for the ones west of it -- reads as "created
-- tomorrow" and falls outside a window whose end is "today", vanishing from
-- every windowed view (7/30/90 days, 12 months) until the UTC date catches
-- up. Lifetime is unaffected (no date filter at all), which is exactly why
-- the rep's own /my-deals -- always range=lifetime -- showed it fine while
-- both admin views (default 90 days) didn't. search_deals()'s age_days has
-- the identical bug for the same reason (0012 onward).
--
-- Fix: a small helper that puts a timestamptz into a specific partner's
-- calendar date the same way partner_today() already does, used everywhere
-- a deal's created_at needs to become "which day was this, for this
-- partner" -- filtered_deals()'s window comparison and search_deals()'s
-- age_days. Neither function's output shape changes, so both stay plain
-- create-or-replace.

create or replace function public.partner_date(p_partner_id uuid, p_ts timestamptz)
returns date
language sql
stable
as $$
  select (p_ts at time zone coalesce(
            (select timezone from partners where id = p_partner_id),
            'America/New_York'))::date
$$;

create or replace function public.filtered_deals(
  p_partner_id uuid,
  p_status     text default null,
  p_team_id    uuid default null,
  p_person_id  uuid default null,
  p_from       date default null,
  p_to         date default null,
  p_on         text default 'created',
  p_q          text default null,
  p_churned    boolean default null
) returns setof deals
language sql
stable
as $$
  select d.*
  from deals d
  join people pe on pe.id = d.person_id
  where d.partner_id = p_partner_id
    and (p_status    is null or d.status = p_status)
    and (p_person_id is null or d.person_id = p_person_id)
    and (p_team_id   is null or pe.team_id = p_team_id)
    and (
      p_from is null
      or case when p_on = 'closed' then d.closed_at else public.partner_date(d.partner_id, d.created_at) end >= p_from
    )
    and (
      p_to is null
      or case when p_on = 'closed' then d.closed_at else public.partner_date(d.partner_id, d.created_at) end <= p_to
    )
    and (
      p_q is null or btrim(p_q) = ''
      or d.client_name ilike '%' || p_q || '%'
      or d.city        ilike '%' || p_q || '%'
      or d.state       ilike '%' || p_q || '%'
      or d.contact     ilike '%' || p_q || '%'
      or d.phone       ilike '%' || p_q || '%'
      or d.email       ilike '%' || p_q || '%'
      or d.service     ilike '%' || p_q || '%'
      or d.promo_note  ilike '%' || p_q || '%'
      or pe.name       ilike '%' || p_q || '%'
    )
    and (
      p_churned is null
      or (p_churned and d.churned_at is not null)
      or (not p_churned and d.churned_at is null)
    )
$$;

create or replace function public.search_deals(
  p_partner_id uuid,
  p_status     text default null,
  p_team_id    uuid default null,
  p_person_id  uuid default null,
  p_from       date default null,
  p_to         date default null,
  p_on         text default 'created',
  p_q          text default null,
  p_sort       text default 'newest',
  p_limit      int  default 25,
  p_offset     int  default 0,
  p_churned    boolean default null
) returns table (
  id uuid, partner_id uuid, person_id uuid,
  person_name text, team_name text, team_color text,
  client_name text, company text, service text, services text[], status text,
  spiff_amount numeric, partner_comp numeric, deal_value numeric, monthly_value numeric,
  live boolean, contact text, phone text, email text, city text, state text,
  employee_count int,
  promo_note text, lost_reason text,
  churn_note text, churned_at date,
  closed_at date, lost_at date, payout_id uuid, created_at timestamptz,
  locked boolean, age_days int, total_count bigint
)
language sql
stable
as $$
  with matched as (
    select * from public.filtered_deals(
      p_partner_id, p_status, p_team_id, p_person_id, p_from, p_to, p_on, p_q, p_churned)
  ),
  counted as (select count(*) as n from matched)
  select d.id, d.partner_id, d.person_id,
         pe.name, t.name, coalesce(t.color, '#6b6f76'),
         d.client_name, d.company, d.service, d.services, d.status,
         d.spiff_amount, d.partner_comp, d.deal_value, d.monthly_value,
         d.live, d.contact, d.phone, d.email, d.city, d.state,
         d.employee_count,
         d.promo_note, d.lost_reason,
         d.churn_note, d.churned_at,
         d.closed_at, d.lost_at, d.payout_id, d.created_at,
         exists (select 1 from payouts p where p.id = d.payout_id and p.voided_at is null),
         (public.partner_today(d.partner_id) - public.partner_date(d.partner_id, d.created_at))::int,
         counted.n
  from matched d
  join people pe on pe.id = d.person_id
  left join teams t on t.id = pe.team_id
  cross join counted
  order by
    case when p_sort = 'newest'     then d.created_at end desc nulls last,
    case when p_sort = 'oldest'     then d.created_at end asc  nulls last,
    case when p_sort = 'longest'    then d.created_at end asc  nulls last,
    case when p_sort = 'client'     then d.client_name end asc nulls last,
    case when p_sort = 'person'     then pe.name end      asc  nulls last,
    case when p_sort = 'spiff_high' then d.spiff_amount end desc nulls last,
    case when p_sort = 'spiff_low'  then d.spiff_amount end asc  nulls last,
    case when p_sort = 'closed'     then d.closed_at end   desc nulls last,
    d.created_at desc
  limit  greatest(p_limit, 1)
  offset greatest(p_offset, 0)
$$;
