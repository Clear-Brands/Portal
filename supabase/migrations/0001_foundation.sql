-- 0001_foundation.sql
-- Extensions, shared helpers, and conventions used by every later migration.
--
-- Conventions established here and honoured throughout:
--   * Money is numeric(12,2). Never float, never computed in JavaScript.
--   * Every table has created_at; mutable tables also have updated_at.
--   * Dates that matter to a partner are derived in that partner's timezone,
--     never from the server's UTC clock. (Fixes the day-drift bug in the
--     original build, where `today()` was UTC but every comparison was local.)

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- trigram search on names/clients
create extension if not exists "citext";        -- case-insensitive email

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

comment on function public.touch_updated_at() is
  'Trigger function: stamps updated_at on every UPDATE.';

-- ---------------------------------------------------------------------------
-- Money helper: round half-up to cents, in SQL, deterministically.
-- ---------------------------------------------------------------------------
create or replace function public.money_round(p_amount numeric)
returns numeric(12,2)
language sql
immutable
as $$
  select round(coalesce(p_amount, 0)::numeric, 2)::numeric(12,2)
$$;

comment on function public.money_round(numeric) is
  'Rounds an amount to cents. All money arithmetic goes through SQL, never JS floats.';
