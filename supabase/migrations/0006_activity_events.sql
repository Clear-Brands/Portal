-- 0006_activity_events.sql
-- The audit log, and the event outbox that feeds GHL.
--
-- Two corrections to the original design:
--
--  1. Activity was logged *before* the mutation was attempted, so a failed
--     write still left "Deal turned Payable — Acme" in the permanent log.
--     Here the log is written by AFTER triggers: no row change, no log line.
--
--  2. Notifications were fired from the browser to an unauthenticated endpoint.
--     Here an event row is written in the same transaction as the change, and a
--     worker drains it with retries. An event is never sent for a change that
--     did not happen, and never lost because a laptop closed.

-- ---------------------------------------------------------------------------
-- activity — human-readable audit trail
-- ---------------------------------------------------------------------------
create table activity (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid references partners(id) on delete cascade,

  kind         text not null check (kind in ('deal','money','team','program','access')),
  text         text not null,

  actor_id     uuid references profiles(id) on delete set null,
  actor_name   text not null default '',

  entity_table text not null default '',
  entity_id    uuid,

  created_at   timestamptz not null default now()
);

create index activity_partner_idx on activity (partner_id, created_at desc);
create index activity_kind_idx    on activity (partner_id, kind, created_at desc);
create index activity_text_trgm   on activity using gin (text gin_trgm_ops);

comment on table activity is
  'Append-only. No update or delete policy is ever granted on this table.';

-- ---------------------------------------------------------------------------
-- Who is acting. Set per-request by the server; falls back to the session.
-- ---------------------------------------------------------------------------
create or replace function public.current_actor_name()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.actor_name', true), ''),
    (select name from profiles where user_id = auth.uid()),
    'System'
  )
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select id from profiles where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- outbox — outbound events awaiting delivery to GHL
-- ---------------------------------------------------------------------------
create table event_outbox (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid references partners(id) on delete cascade,

  event          text not null,
  payload        jsonb not null default '{}'::jsonb,

  status         text not null default 'pending'
                   check (status in ('pending','delivering','delivered','failed')),
  attempts       int not null default 0,
  last_error     text not null default '',
  next_attempt_at timestamptz not null default now(),
  delivered_at   timestamptz,

  created_at     timestamptz not null default now()
);

create index event_outbox_pending_idx
  on event_outbox (next_attempt_at)
  where status in ('pending','failed');
create index event_outbox_partner_idx on event_outbox (partner_id, created_at desc);

comment on table event_outbox is
  'Written in the same transaction as the change it describes. Drained by a scheduled worker.';

-- ---------------------------------------------------------------------------
-- inbound webhooks — stored raw before processing, so a mapping bug is
-- replayable instead of forensic.
-- ---------------------------------------------------------------------------
create table webhook_events (
  id              uuid primary key default gen_random_uuid(),
  source          text not null default 'ghl',
  idempotency_key text not null,

  payload         jsonb not null,
  status          text not null default 'received'
                    check (status in ('received','processed','ignored','error')),
  error           text not null default '',
  processed_at    timestamptz,

  created_at      timestamptz not null default now(),

  unique (source, idempotency_key)
);

create index webhook_events_status_idx on webhook_events (status, created_at desc);

comment on column webhook_events.idempotency_key is
  'The same invoice-paid event arriving twice must not close a deal twice.';

-- ---------------------------------------------------------------------------
-- Deal activity, written after the fact
-- ---------------------------------------------------------------------------
create or replace function public.log_deal_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person text;
  v_msg    text;
begin
  select name into v_person from people where id = new.person_id;

  if tg_op = 'INSERT' then
    v_msg := format('New deal — %s (%s, %s)',
                    new.client_name, coalesce(v_person, 'unassigned'),
                    to_char(new.spiff_amount, 'FM$999,999,990.00'));
  elsif old.status is distinct from new.status then
    v_msg := format('Deal moved to %s — %s (%s)',
                    case new.status
                      when 'closed'    then 'Payable'
                      when 'in_talks'  then 'In talks'
                      when 'submitted' then 'Submitted'
                      when 'paid'      then 'Paid'
                      when 'lost'      then 'Lost'
                    end,
                    new.client_name, coalesce(v_person, 'unassigned'))
             || case when new.status = 'lost' and new.lost_reason <> ''
                     then ' — ' || new.lost_reason else '' end;
  else
    return null;
  end if;

  insert into activity (partner_id, kind, text, actor_id, actor_name, entity_table, entity_id)
  values (new.partner_id, 'deal', v_msg,
          public.current_profile_id(), public.current_actor_name(), 'deals', new.id);

  return null;
end $$;

create trigger deals_log_activity
  after insert or update on deals
  for each row execute function public.log_deal_activity();

-- ---------------------------------------------------------------------------
-- Money activity
-- ---------------------------------------------------------------------------
create or replace function public.log_payout_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner text;
  v_msg     text;
begin
  select name into v_partner from partners where id = new.partner_id;

  if tg_op = 'INSERT' then
    v_msg := format('Payout recorded — %s to %s (ref %s)',
                    to_char(new.total, 'FM$999,999,990.00'), v_partner, new.reference);
  elsif old.voided_at is null and new.voided_at is not null then
    v_msg := format('Payout voided — %s to %s (ref %s) — %s',
                    to_char(new.total, 'FM$999,999,990.00'), v_partner, new.reference, new.void_reason);
  else
    return null;
  end if;

  insert into activity (partner_id, kind, text, actor_id, actor_name, entity_table, entity_id)
  values (new.partner_id, 'money', v_msg,
          public.current_profile_id(), public.current_actor_name(), 'payouts', new.id);

  return null;
end $$;

create trigger payouts_log_activity
  after insert or update on payouts
  for each row execute function public.log_payout_activity();
