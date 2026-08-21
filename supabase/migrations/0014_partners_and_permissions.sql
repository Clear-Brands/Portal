-- 0014_partners_and_permissions.sql
-- Partner onboarding/administration and permission management — Phase 04.
--
-- Two hardening fixes travel with this phase, both closing gaps the schema
-- already had the shape for but never enforced:
--
--  1. Self-elevation. `profiles_write_internal` (0008_rls.sql) let ANY internal
--     login holding `people.write` rewrite ANY profile row — including their
--     own. Clear Brands managers hold `people.write` by default
--     (ROLE_DEFAULTS['internal:manager']), so a manager could `update profiles
--     set access = 'admin' where user_id = auth.uid()` and grant themselves
--     every capability there is. Changing who holds what access is now its own
--     line: only an existing admin may write the profiles table at all.
--
--  2. The last partner. Nothing stopped every partner from being archived at
--     once, which would leave the product with no active tenant and no UI path
--     back. A BEFORE UPDATE trigger refuses the archive rather than the
--     application layer, for the same reason `deals_guard_member_edit` is a
--     trigger and not just a policy: it cannot be bypassed by any code path,
--     including a future one nobody thinks to add the app-layer check to.

-- ---------------------------------------------------------------------------
-- my_access() — the missing sibling of my_role() / my_partner_id().
-- ---------------------------------------------------------------------------
create or replace function public.my_access()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select access from profiles where user_id = auth.uid() limit 1
$$;

-- ---------------------------------------------------------------------------
-- Fix 1 — only an admin may write the profiles table.
--
-- `people.write` still governs the roster (people, departments, teams) for
-- internal managers; it never governed who holds what capability, and now it
-- provably doesn't.
-- ---------------------------------------------------------------------------
drop policy profiles_write_internal on profiles;

create policy profiles_write_admin on profiles for all to authenticated
  using      (my_role() = 'internal' and my_access() = 'admin')
  with check (my_role() = 'internal' and my_access() = 'admin');

-- ---------------------------------------------------------------------------
-- Fix 2 — the last active partner cannot be archived.
-- ---------------------------------------------------------------------------
create or replace function public.guard_last_active_partner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_active int;
begin
  if old.archived_at is null and new.archived_at is not null then
    select count(*) into v_other_active
    from partners
    where archived_at is null and id <> old.id;

    if v_other_active = 0 then
      raise exception 'At least one partner must stay active — archive another one first, or restore this one later.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

create trigger partners_guard_last_active
  before update on partners
  for each row execute function public.guard_last_active_partner();

comment on trigger partners_guard_last_active on partners is
  'A database-level backstop, not an app-layer check — see the ledger and deal-edit
   triggers elsewhere in this schema for why that distinction matters.';

-- ---------------------------------------------------------------------------
-- archive_partner / restore_partner
--
-- archived_at is an event instant, not a partner-local business date (unlike
-- a deal's closed_at or a rev-share period), so it is set from the database
-- clock here — the same convention as voided_at and every other "when did
-- this happen" timestamp in this schema — never passed in from JavaScript.
-- The last-partner guard above applies no matter which path reaches this
-- update, but routing archive/restore through a guarded RPC keeps the
-- capability check and the friendly failure message in one place, matching
-- record_payout / void_payout.
-- ---------------------------------------------------------------------------
create or replace function public.archive_partner(p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_cap('partners.write') then
    raise exception 'You do not have permission to archive a partner' using errcode = '42501';
  end if;

  update partners set archived_at = now() where id = p_partner_id and archived_at is null;

  if not found then
    raise exception 'That partner does not exist or is already archived' using errcode = '22023';
  end if;
end $$;

create or replace function public.restore_partner(p_partner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_cap('partners.write') then
    raise exception 'You do not have permission to restore a partner' using errcode = '42501';
  end if;

  update partners set archived_at = null where id = p_partner_id and archived_at is not null;

  if not found then
    raise exception 'That partner does not exist or is not archived' using errcode = '22023';
  end if;
end $$;

revoke execute on function
  public.archive_partner(uuid),
  public.restore_partner(uuid)
from public;

grant execute on function
  public.archive_partner(uuid),
  public.restore_partner(uuid)
to authenticated;
