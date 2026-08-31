-- 0027_churned_filter.sql
--
-- "Add an option to filter deals by churned for list and pipeline. Right now
-- we have all the other stages to filter by but need this one." (Aug 2026
-- edit doc, High Priority.)
--
-- Churn is not a deal status — a churned account can be sitting in any
-- status (almost always 'paid') with live = false and churned_at stamped by
-- the 0026 lifecycle trigger. So this is a separate boolean filter, not a
-- new entry in deal_status / DEAL_STATUSES, and it composes with every other
-- filter the same way p_status already does. p_churned is appended at the
-- end of each signature so `create or replace` can widen these in place —
-- no drop/recreate, no grant churn.

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
    and (
      p_churned is null
      or (p_churned and d.churned_at is not null)
      or (not p_churned and d.churned_at is null)
    )
$$;

-- ---------------------------------------------------------------------------
-- search_deals(): thread p_churned through to filtered_deals. Return shape is
-- unchanged from 0026, so this stays a plain create-or-replace.
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
  p_offset     int  default 0,
  p_churned    boolean default null
) returns table (
  id uuid, partner_id uuid, person_id uuid,
  person_name text, team_name text, team_color text,
  client_name text, service text, services text[], status text,
  spiff_amount numeric, partner_comp numeric, deal_value numeric, monthly_value numeric,
  live boolean, contact text, phone text, email text, city text, state text,
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

-- ---------------------------------------------------------------------------
-- summarise_deals(): same widening, so the summary line above the list agrees
-- with the churned filter exactly the same way it agrees with every other one.
-- ---------------------------------------------------------------------------
create or replace function public.summarise_deals(
  p_partner_id uuid,
  p_status     text default null,
  p_team_id    uuid default null,
  p_person_id  uuid default null,
  p_from       date default null,
  p_to         date default null,
  p_on         text default 'created',
  p_q          text default null,
  p_churned    boolean default null
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
    p_partner_id, p_status, p_team_id, p_person_id, p_from, p_to, p_on, p_q, p_churned)
$$;

-- ---------------------------------------------------------------------------
-- deal_status_counts(): the pipeline's column totals. Widened the same way so
-- "Churned only" on the pipeline shows honest per-column counts, not just a
-- filtered card list under a stale total.
-- ---------------------------------------------------------------------------
create or replace function public.deal_status_counts(p_partner_id uuid, p_churned boolean default null)
returns table (status text, count bigint)
language sql
stable
as $$
  select d.status, count(*)
  from deals d
  where d.partner_id = p_partner_id
    and (
      p_churned is null
      or (p_churned and d.churned_at is not null)
      or (not p_churned and d.churned_at is null)
    )
  group by d.status
$$;

grant execute on function
  public.filtered_deals(uuid, text, uuid, uuid, date, date, text, text, boolean),
  public.search_deals(uuid, text, uuid, uuid, date, date, text, text, text, int, int, boolean),
  public.summarise_deals(uuid, text, uuid, uuid, date, date, text, text, boolean),
  public.deal_status_counts(uuid, boolean)
to authenticated;
