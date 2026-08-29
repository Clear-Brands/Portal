-- 30_capabilities.sql
-- The permission model exists twice: capability_default() in 0007_access.sql for
-- the database, and ROLE_DEFAULTS in src/lib/auth/capabilities.ts for the
-- interface. If those two ever disagree, the portal shows someone a button that
-- the database will refuse — or worse, hides one it would have allowed.
--
-- This asserts the SQL half. scripts/check-capability-parity.mjs reads the
-- TypeScript half and compares. Both run in CI.

\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.ok(p_label text, p_cond boolean) returns void
language plpgsql as $$
begin
  if p_cond then raise notice '  PASS  %', p_label;
  else raise exception 'FAIL  %', p_label; end if;
end $$;

do $$
declare
  v_all text[] := array[
    'deals.write','people.write','programs.write','partners.write','rates.write',
    'payouts.write','payouts.view','revshare.write','revshare.view',
    'activity.view','exports.run','spiffs.view','competitions.view','podium.view',
    'assets.write','assets.view'
  ];
  k text;
begin
  raise notice '';
  raise notice 'CAPABILITY DEFAULTS';

  -- A Clear Brands admin holds everything.
  foreach k in array v_all loop
    perform pg_temp.ok('internal admin holds ' || k,
      public.capability_default('internal', 'admin', k));
  end loop;

  -- A Clear Brands manager works, but never writes money.
  perform pg_temp.ok('internal manager: deals.write',       public.capability_default('internal','manager','deals.write'));
  perform pg_temp.ok('internal manager: people.write',      public.capability_default('internal','manager','people.write'));
  perform pg_temp.ok('internal manager: programs.write',    public.capability_default('internal','manager','programs.write'));
  perform pg_temp.ok('internal manager: exports.run',       public.capability_default('internal','manager','exports.run'));
  perform pg_temp.ok('internal manager: activity.view',     public.capability_default('internal','manager','activity.view'));
  perform pg_temp.ok('internal manager: NOT payouts.write', not public.capability_default('internal','manager','payouts.write'));
  perform pg_temp.ok('internal manager: NOT revshare.write',not public.capability_default('internal','manager','revshare.write'));
  perform pg_temp.ok('internal manager: NOT rates.write',   not public.capability_default('internal','manager','rates.write'));
  perform pg_temp.ok('internal manager: NOT partners.write',not public.capability_default('internal','manager','partners.write'));
  -- The original's SQL and client disagreed on exactly this key: the client
  -- defaulted view_revshare on for managers while the SQL policy left rev share
  -- readable unconditionally, so "hiding" it hid nothing.
  perform pg_temp.ok('internal manager: NOT revshare.view', not public.capability_default('internal','manager','revshare.view'));
  -- assets.write follows rates.write/partners.write exactly: admin by
  -- default, never manager, always overridable per login from the grid.
  perform pg_temp.ok('internal manager: NOT assets.write',  not public.capability_default('internal','manager','assets.write'));

  -- Partner admins: their own organisation, money read-only.
  perform pg_temp.ok('partner admin: payouts.view',        public.capability_default('partner_admin','none','payouts.view'));
  perform pg_temp.ok('partner admin: revshare.view',       public.capability_default('partner_admin','none','revshare.view'));
  perform pg_temp.ok('partner admin: people.write',        public.capability_default('partner_admin','none','people.write'));
  perform pg_temp.ok('partner admin: assets.view',         public.capability_default('partner_admin','none','assets.view'));
  perform pg_temp.ok('partner admin: NOT payouts.write',   not public.capability_default('partner_admin','none','payouts.write'));
  perform pg_temp.ok('partner admin: NOT rates.write',     not public.capability_default('partner_admin','none','rates.write'));
  perform pg_temp.ok('partner admin: NOT activity.view',   not public.capability_default('partner_admin','none','activity.view'));
  perform pg_temp.ok('partner admin: NOT assets.write',    not public.capability_default('partner_admin','none','assets.write'));

  -- Members see their own numbers and nothing structural.
  perform pg_temp.ok('member: spiffs.view',                public.capability_default('member','none','spiffs.view'));
  perform pg_temp.ok('member: competitions.view',          public.capability_default('member','none','competitions.view'));
  perform pg_temp.ok('member: podium.view',                public.capability_default('member','none','podium.view'));
  perform pg_temp.ok('member: assets.view',                public.capability_default('member','none','assets.view'));
  perform pg_temp.ok('member: NOT deals.write',            not public.capability_default('member','none','deals.write'));
  perform pg_temp.ok('member: NOT people.write',           not public.capability_default('member','none','people.write'));
  perform pg_temp.ok('member: NOT payouts.view',           not public.capability_default('member','none','payouts.view'));
  perform pg_temp.ok('member: NOT assets.write',           not public.capability_default('member','none','assets.write'));

  -- An unknown role holds nothing at all.
  perform pg_temp.ok('an unknown role holds nothing',
    not public.capability_default('nonsense','none','deals.write'));

  raise notice '';
end $$;
