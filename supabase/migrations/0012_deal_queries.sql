-- 0012_deal_queries.sql
-- Filtering, paging and totalling deals — defined once.
--
-- The list and the summary line above it must agree, always. In the original
-- they did not: the table filtered on one thing and the headline "$X in closed
-- spiffs" summed another, so the number never matched the window it claimed.
--
-- `filtered_deals()` is the single definition of "which deals match". The list
-- reads a sorted page from it; the summary aggregates all of it. Neither can
-- drift from the other because there is only one WHERE clause.
--
-- These are invoker-rights functions on purpose: row-level security applies to
-- the caller exactly as it would on a direct query, so a member calling them
-- still sees only their own deals.

create or replace function public.filtered_deals(
  p_partner_id uuid,
  p_status     text default null,
  p_team_id    uuid default null,
  p_person_id  uuid default null,
  p_from       date default null,
  p_to         date default null,
  p_on         text default 'created',
  p_q          text default null
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
      or case when p_on = 'closed' then d.closed_at else d.created_at::date end >= p_from
    )
    and (
      p_to is null
      or case when p_on = 'closed' then d.closed_at else d.created_at::date end <= p_to
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
$$;

comment on function public.filtered_deals is
  'The one definition of which deals match a filter set. search_deals() and summarise_deals() both build on it.';

-- ---------------------------------------------------------------------------
-- A sorted, paged slice — with the matching person and pod already joined, and
-- the unpaged total carried alongside so the pager needs no second round trip.
-- ---------------------------------------------------------------------------
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
  p_offset     int  default 0
) returns table (
  id uuid, partner_id uuid, person_id uuid,
  person_name text, team_name text, team_color text,
  client_name text, service text, status text,
  spiff_amount numeric, partner_comp numeric, deal_value numeric, monthly_value numeric,
  live boolean, contact text, phone text, email text, city text, state text,
  promo_note text, lost_reason text,
  closed_at date, lost_at date, payout_id uuid, created_at timestamptz,
  locked boolean, age_days int, total_count bigint
)
language sql
stable
as $$
  with matched as (
    select * from public.filtered_deals(
      p_partner_id, p_status, p_team_id, p_person_id, p_from, p_to, p_on, p_q)
  ),
  counted as (select count(*) as n from matched)
  select d.id, d.partner_id, d.person_id,
         pe.name, t.name, coalesce(t.color, '#6b6f76'),
         d.client_name, d.service, d.status,
         d.spiff_amount, d.partner_comp, d.deal_value, d.monthly_value,
         d.live, d.contact, d.phone, d.email, d.city, d.state,
         d.promo_note, d.lost_reason,
         d.closed_at, d.lost_at, d.payout_id, d.created_at,
         -- A deal inside a live payout batch cannot be moved until it is voided.
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

-- ---------------------------------------------------------------------------
-- Totals across every matching row — not the visible page.
-- ---------------------------------------------------------------------------
create or replace function public.summarise_deals(
  p_partner_id uuid,
  p_status     text default null,
  p_team_id    uuid default null,
  p_person_id  uuid default null,
  p_from       date default null,
  p_to         date default null,
  p_on         text default 'created',
  p_q          text default null
) returns table (
  deal_count    bigint,
  spiff_total   numeric,
  payable_total numeric,
  comp_total    numeric,
  closes        bigint
)
language sql
stable
as $$
  select count(*),
         coalesce(sum(spiff_amount), 0)::numeric(12,2),
         coalesce(sum(spiff_amount) filter (where status = 'closed'), 0)::numeric(12,2)
           + coalesce(sum(partner_comp) filter (where status = 'closed'), 0)::numeric(12,2),
         coalesce(sum(partner_comp), 0)::numeric(12,2),
         count(*) filter (where status in ('closed','paid'))
  from public.filtered_deals(
    p_partner_id, p_status, p_team_id, p_person_id, p_from, p_to, p_on, p_q)
$$;

-- ---------------------------------------------------------------------------
-- Column counts for the pipeline, so a board that shows the newest 40 per column
-- can say honestly how many there really are.
-- ---------------------------------------------------------------------------
create or replace function public.deal_status_counts(p_partner_id uuid)
returns table (status text, count bigint)
language sql
stable
as $$
  select d.status, count(*)
  from deals d
  where d.partner_id = p_partner_id
  group by d.status
$$;

-- ---------------------------------------------------------------------------
-- Stalled deals: submitted or in talks with no movement for N days. Surfaced on
-- the dashboard so nothing quietly rots in the pipeline.
-- ---------------------------------------------------------------------------
create or replace function public.stalled_deals(p_partner_id uuid, p_days int default 30)
returns table (id uuid, client_name text, person_name text, status text, age_days int)
language sql
stable
as $$
  select d.id, d.client_name, pe.name, d.status,
         (public.partner_today(d.partner_id) - d.updated_at::date)::int
  from deals d
  join people pe on pe.id = d.person_id
  where d.partner_id = p_partner_id
    and d.status in ('submitted','in_talks')
    and d.updated_at::date <= public.partner_today(d.partner_id) - p_days
  order by d.updated_at asc
$$;

grant execute on function
  public.filtered_deals(uuid, text, uuid, uuid, date, date, text, text),
  public.search_deals(uuid, text, uuid, uuid, date, date, text, text, text, int, int),
  public.summarise_deals(uuid, text, uuid, uuid, date, date, text, text),
  public.deal_status_counts(uuid),
  public.stalled_deals(uuid, int)
to authenticated;
