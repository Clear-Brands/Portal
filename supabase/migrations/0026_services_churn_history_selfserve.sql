-- 0026_services_churn_history_selfserve.sql
--
-- Four small, independent additions from the Aug 2026 edit doc:
--
--   1. Multi-select services on a deal. `service` (singular) stays exactly as
--      it was — every filter, search, and export still reads it — but it is
--      now a derived column, kept in sync by trigger from the new `services`
--      array whenever that array is written. Nothing that only ever read
--      `service` needs to change.
--   2. Churned clients get a note and a date, alongside the `live = false`
--      state that already existed. Stamped by trigger, the same way
--      `lost_at` already is, so no code path can set `live = false` and
--      accidentally skip it.
--   3. A per-deal status history, logged automatically on every transition —
--      the raw material "how long was this deal in each stage" is computed
--      from, on the deal detail page.
--   4. A partner-level switch for the rep self-serve "Submit a deal" form.
--      Defaults to true (today's behaviour, unchanged) so flipping it is a
--      deliberate per-partner decision by Clear Brands, not a flag day.

-- ---------------------------------------------------------------------------
-- 1. services
-- ---------------------------------------------------------------------------
alter table deals add column if not exists services text[] not null default '{}';

update deals
   set services = case when btrim(service) <> '' then array[btrim(service)] else '{}'::text[] end
 where services = '{}';

create or replace function public.deals_sync_service_text()
returns trigger
language plpgsql
as $$
begin
  new.service := array_to_string(coalesce(new.services, '{}'), ', ');
  return new;
end $$;

create trigger deals_sync_service_text
  before insert or update of services on deals
  for each row execute function public.deals_sync_service_text();

comment on column deals.services is
  'The full multi-select set. deals.service (singular) is derived from this by trigger — ", "-joined — so every existing filter, search and export keeps working unchanged.';

-- ---------------------------------------------------------------------------
-- 2. churn note + date
-- ---------------------------------------------------------------------------
alter table deals add column if not exists churn_note text not null default '';
alter table deals add column if not exists churned_at date;

comment on column deals.churn_note is
  'Why the account was marked churned. Set alongside live = false; cleared if it goes live again.';

-- ---------------------------------------------------------------------------
-- 3. status history
-- ---------------------------------------------------------------------------
create table if not exists deal_status_history (
  id         uuid primary key default gen_random_uuid(),
  deal_id    uuid not null references deals(id) on delete cascade,
  status     text not null,
  entered_at timestamptz not null default now()
);

create index if not exists deal_status_history_deal_idx
  on deal_status_history (deal_id, entered_at);

create or replace function public.deals_log_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into deal_status_history (deal_id, status, entered_at) values (new.id, new.status, now());
  elsif new.status is distinct from old.status then
    insert into deal_status_history (deal_id, status, entered_at) values (new.id, new.status, now());
  end if;
  return new;
end $$;

drop trigger if exists deals_log_status_history on deals;
create trigger deals_log_status_history
  after insert or update on deals
  for each row execute function public.deals_log_status_history();

-- Backfill one row per existing deal so the timeline has a starting point —
-- best-effort only; a deal's real first-submitted moment is created_at.
insert into deal_status_history (deal_id, status, entered_at)
select id, status, created_at from deals
where not exists (select 1 from deal_status_history h where h.deal_id = deals.id);

alter table deal_status_history enable row level security;

create policy deal_status_history_read_internal on deal_status_history for select to authenticated
  using (public.my_role() = 'internal' and public.my_is_active());

create policy deal_status_history_read_partner_admin on deal_status_history for select to authenticated
  using (
    public.my_role() = 'partner_admin' and public.my_is_active()
    and exists (select 1 from deals d where d.id = deal_id and d.partner_id = public.my_partner_id())
  );

create policy deal_status_history_read_own on deal_status_history for select to authenticated
  using (
    public.my_role() = 'member' and public.my_is_active()
    and exists (
      select 1 from deals d
      where d.id = deal_id and d.partner_id = public.my_partner_id() and d.person_id = public.my_person_id()
    )
  );

create policy deal_status_history_read_pod_manager on deal_status_history for select to authenticated
  using (
    public.my_role() = 'member' and public.has_pod_cap('pod.numbers.view')
    and exists (
      select 1 from deals d
      join people pe on pe.id = d.person_id
      where d.id = deal_id
        and d.partner_id = public.my_partner_id()
        and pe.team_id in (select public.my_managed_team_ids())
    )
  );

grant select on deal_status_history to authenticated;

-- Extend the lifecycle trigger (0018's version) with churn stamping, so it
-- happens no matter which code path flips `live` — the same guarantee
-- lost_at already has.
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

  if tg_op = 'UPDATE' and new.live is distinct from old.live then
    if new.live = false then
      new.churned_at := v_today;
    elsif new.live = true then
      new.churned_at := null;
      new.churn_note := '';
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- search_deals(): carry services, churn_note and churned_at through, so the
-- deals list and detail page can render them without a second query.
-- ---------------------------------------------------------------------------
drop function if exists public.search_deals(uuid, text, uuid, uuid, date, date, text, text, text, int, int);

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
  p_offset     int  default 0
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
      p_partner_id, p_status, p_team_id, p_person_id, p_from, p_to, p_on, p_q)
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

grant execute on function
  public.search_deals(uuid, text, uuid, uuid, date, date, text, text, text, int, int)
to authenticated;

-- ---------------------------------------------------------------------------
-- deal_status_history read helper: the durations page reads the raw rows
-- directly (RLS above already scopes them), no RPC needed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- submit_deal(): now takes the same multi-select services a rep can pick from
-- the "Submit a deal" form.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_deal(text, text, text, text, text, text, text, text);

create function public.submit_deal(
  p_client   text,
  p_services text[] default '{}',
  p_city     text default '',
  p_state    text default '',
  p_contact  text default '',
  p_phone    text default '',
  p_email    text default '',
  p_note     text default ''
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person  uuid := public.my_person_id();
  v_partner uuid := public.my_partner_id();
  v_self_serve boolean;
  v_id      uuid;
begin
  if v_person is null or v_partner is null or not public.my_is_active() then
    raise exception 'Your portal access is not active' using errcode = '42501';
  end if;
  if coalesce(btrim(p_client), '') = '' then
    raise exception 'A client name is required' using errcode = '22023';
  end if;

  select coalesce(self_serve_deals_enabled, true) into v_self_serve
  from partners where id = v_partner;

  if not coalesce(v_self_serve, true) then
    raise exception 'Manual submission is off for your account — book the discovery call instead and it will log itself.'
      using errcode = '42501';
  end if;

  insert into deals (partner_id, person_id, client_name, services,
                     city, state, contact, phone, email, promo_note,
                     status, spiff_amount)
  values (v_partner, v_person, btrim(p_client), coalesce(p_services, '{}'),
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

revoke execute on function public.submit_deal(text, text[], text, text, text, text, text, text) from public;
grant execute on function public.submit_deal(text, text[], text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. self_serve_deals_enabled
-- ---------------------------------------------------------------------------
alter table partners add column if not exists self_serve_deals_enabled boolean not null default true;

comment on column partners.self_serve_deals_enabled is
  'Whether a rep can use the "Submit a deal" form on My deals. The automatic booking-link path (GHL webhook) is never affected by this — it is not "manual" entry. Defaults true so this ships with no behaviour change until Clear Brands turns it off for a specific partner.';
