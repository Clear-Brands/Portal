-- 00_local_shim.sql
--
-- VERIFICATION ONLY — never applied to a Supabase project.
--
-- Supabase provides the `auth` schema, the anon/authenticated/service_role
-- roles, and auth.uid()/auth.jwt(). This file stands those up on a bare
-- PostgreSQL instance so the migrations can be applied to a genuinely empty
-- database in CI, which is the check the original schema.sql could never pass.
--
-- 0025_partner_assets.sql is the first migration to touch Supabase's
-- `storage` schema (a bucket row, two policies on storage.objects) — nothing
-- before it needed one, so this shim grew the minimum slice of that schema
-- to match: enough for those statements to run against a bare Postgres
-- instance, not a working Storage API.

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

-- ---------------------------------------------------------------------------
-- storage — the minimum slice: a bucket row and the objects table that
-- 0025_partner_assets.sql's policies attach to. `storage.foldername()` below
-- is copied verbatim from Supabase's real definition (splits an object path
-- on "/" and drops the filename), since a policy in that migration calls it.
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                  text primary key,
  name                text not null,
  public              boolean not null default false,
  file_size_limit     bigint,
  allowed_mime_types  text[],
  created_at          timestamptz default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets(id),
  name        text,
  owner       uuid,
  created_at  timestamptz default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
