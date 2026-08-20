-- 0007_access.sql
-- One permission model, defined once.
--
-- The original had four overlapping systems — internal manager grants, partner
-- admin grants, rep visibility switches and pod-manager grants — of which
-- exactly two keys were enforced in the database. Everything else hid buttons
-- and changed nothing. Here there is a single capability vocabulary, a single
-- resolver, and every policy in 0008 is written against it.
--
-- The same vocabulary lives in src/lib/auth/capabilities.ts, and
-- supabase/tests/rls_test.sql asserts the two agree.

-- ---------------------------------------------------------------------------
-- Session helpers. All resolve through auth.uid(), never an email string.
-- ---------------------------------------------------------------------------
create or replace function public.my_profile()
returns profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from profiles where user_id = auth.uid() limit 1
$$;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where user_id = auth.uid() limit 1
$$;

create or replace function public.my_partner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select partner_id from profiles where user_id = auth.uid() limit 1
$$;

create or replace function public.my_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select person_id from profiles where user_id = auth.uid() limit 1
$$;

-- A member is only "active" if their roster row is active. Deactivation was a
-- UI screen in the original; the database still handed over every row.
create or replace function public.my_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select role from profiles where user_id = auth.uid()) is null then false
    when (select role from profiles where user_id = auth.uid()) <> 'member' then true
    else coalesce((
      select pe.active
      from profiles pr join people pe on pe.id = pr.person_id
      where pr.user_id = auth.uid()
    ), false)
  end
$$;

-- Pods this member manages, for the pod-manager grants.
create or replace function public.my_managed_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
  from teams t
  join profiles pr on pr.user_id = auth.uid()
  where pr.person_id is not null
    and t.partner_id = pr.partner_id
    and pr.person_id = any (t.manager_ids)
$$;

-- ---------------------------------------------------------------------------
-- Capability defaults by role. An absent perms key falls back to these.
-- ---------------------------------------------------------------------------
create or replace function public.capability_default(p_role text, p_access text, p_key text)
returns boolean
language sql
immutable
as $$
  select case
    -- Clear Brands admins hold everything.
    when p_role = 'internal' and p_access = 'admin' then true

    -- Clear Brands managers: day-to-day work, no money writes.
    when p_role = 'internal' and p_access = 'manager' then
      p_key in ('deals.write','people.write','programs.write','exports.run','activity.view')

    -- Partner admins: their own org, money read-only.
    when p_role = 'partner_admin' then
      p_key in ('payouts.view','revshare.view','people.write','exports.run')

    -- Members: what they can see of their own numbers.
    when p_role = 'member' then
      p_key in ('spiffs.view','competitions.view','podium.view')

    else false
  end
$$;

comment on function public.capability_default(text, text, text) is
  'Mirrors ROLE_DEFAULTS in src/lib/auth/capabilities.ts. Kept in step by supabase/tests/rls_test.sql.';

-- ---------------------------------------------------------------------------
-- The resolver every policy calls.
-- ---------------------------------------------------------------------------
create or replace function public.has_cap(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.my_is_active() then false
    else coalesce(
      (select coalesce(
                (pr.perms ->> p_key)::boolean,
                public.capability_default(pr.role, pr.access, p_key))
       from profiles pr
       where pr.user_id = auth.uid()
       limit 1),
      false)
  end
$$;

comment on function public.has_cap(text) is
  'The single permission predicate. Every RLS policy that gates an action calls this — not just the
   two tables the original bothered to check.';

-- Pod-manager grants live on the person row, not the profile.
create or replace function public.has_pod_cap(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not public.my_is_active() then false
    else coalesce(
      (select coalesce((pe.perms ->> p_key)::boolean,
                       case p_key
                         when 'pod.people.write'  then true
                         when 'pod.numbers.view'  then true
                         when 'pod.money.view'    then false
                         else false
                       end)
       from profiles pr join people pe on pe.id = pr.person_id
       where pr.user_id = auth.uid() and pe.kind = 'manager'
       limit 1),
      false)
  end
$$;
