-- 0030_search_deals_restore_company.sql
--
-- Found live-QAing 0029: deals.company (added 0023, first surfaced through
-- search_deals in 0024) silently stopped being selected when 0026 rewrote
-- search_deals to add services/churn_note/churned_at — 0026's SELECT list
-- dropped d.company and nobody caught it because every later migration
-- (0027, 0028, 0029) copied 0026's column list forward as-is. The column
-- itself was never touched — deals.company has been populated correctly the
-- whole time, including by the GHL booking webhook — it just never reached
-- the app, so "Company" has shown "—" on every deal detail page since 0026
-- shipped, for every partner. Confirmed live: real webhook-created deals
-- have non-empty deals.company in the table right now.
--
-- Restoring it the same drop-then-create way as every other search_deals
-- column change in this file's history — the output column set is changing,
-- which create-or-replace won't allow.

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
