-- 00_local_shim.sql
--
-- VERIFICATION ONLY — never applied to a Supabase project.
--
-- Supabase provides the `auth` schema, the anon/authenticated/service_role
-- roles, and auth.uid()/auth.jwt(). This file stands those up on a bare
-- PostgreSQL instance so the migrations can be applied to a genuinely empty
-- database in CI, which is the check the original schema.sql could never pass.

create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  created_at          timestamptz default now()
);

-- The session's user id. Tests set app.user_id to impersonate.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.jwt', true), '')::jsonb,
    jsonb_build_object(
      'sub',   coalesce(current_setting('app.user_id', true), ''),
      'email', coalesce((select email from auth.users where id = auth.uid()), '')
    )
  )
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('app.pg_role', true), ''), 'authenticated')
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
