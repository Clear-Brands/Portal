-- 0029_ghl_webhook_completeness.sql
--
-- "Some of the data is pulling in with the webhook from the booking link but
-- not all of the data is pulling in... All the services, Comments, Phone
-- number, Email, Company name, Number of employees, City, State. Everything
-- in the booking page." (Charles, Sept 2026.)
--
-- Phone/email/company/city/state were already landing correctly (confirmed
-- against real webhook_events rows). Two things genuinely were not:
--
--   1. Comments never had anywhere to land — the route read body.notes, but
--      no real GHL delivery carries a top-level `notes` key at all (checked
--      directly against production webhook_events; it's always null there).
--      The real field is a full question string ("Do you have any other
--      comments?"), the same "GHL sends its native payload, not the clean
--      custom-mapped shape" issue bf11523 already fixed once for rep_email.
--      Fixed in the route itself (ghl-booking/route.ts), not here — no
--      schema change needed, this reuses the existing promo_note column.
--   2. Number of employees has no column to land in at all. That's what this
--      migration adds.
--
-- Services already had a column (0026) — deals created by hand or via
-- "Submit a deal" already set it. The webhook alone never did; fixed
-- alongside comments in the route.

alter table deals add column if not exists employee_count integer;

comment on column deals.employee_count is
  'From the GHL booking form ("Number of employees "), when the client answered it. Null when unknown or unanswered — never defaulted to 0, which would read as a real answer.';

-- ---------------------------------------------------------------------------
-- search_deals(): carry employee_count through, the same way 0026 added
-- services/churn_note/churned_at. This changes the RETURNS TABLE shape, so —
-- per the 0028 incident notes above every migration since — the old
-- signature has to be dropped first, or "create or replace" silently leaves
-- a second overload behind and every call omitting a trailing default
-- becomes ambiguous in production. Current live signature (post-0027/0028)
-- takes p_churned as its 12th argument; that part is unchanged here, only
-- the output list grows.
-- ---------------------------------------------------------------------------
drop function if exists public.search_deals(uuid, text, uuid, uuid, date, date, text, text, text, int, int, boolean);

create function public.search_deals(
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
  client_name text, service text, services text[], status text,
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
         d.client_name, d.service, d.services, d.status,
         d.spiff_amount, d.partner_comp, d.deal_value, d.monthly_value,
         d.live, d.contact, d.phone, d.email, d.city, d.state,
         d.employee_count,
         d.promo_note, d.lost_reason,
         d.churn_note, d.churned_at,
         d.closed_at, d.lost_at, d.payout_id, d.created_at,
         exists (select 1 from payouts p where p.id = d.payout_id and p.voided_at is null),
         (public.partner_today(d.partner_id) - d.created_at::date)::int,
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

grant execute on function
  public.search_deals(uuid, text, uuid, uuid, date, date, text, text, text, int, int, boolean)
to authenticated;
