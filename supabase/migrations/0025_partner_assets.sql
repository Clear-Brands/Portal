-- 0025_partner_assets.sql
--
-- Charles's ask: a place for Clear Brands to upload partner-specific
-- documents (rate sheets, program flyers, training material — PDFs only) so
-- a partner's own sales team and account managers can find them by logging
-- into the portal, instead of hunting through email. Scoped per partner,
-- same as everything else a partner_admin/member can see: row-level security
-- keys it off my_partner_id(), not a query param the browser could change.
--
-- Two new capabilities, following the exact shape rates.write/partners.write
-- already established for "admin-only by default, per-login overridable":
--
--   assets.write — upload and remove. Internal only, admin by default (never
--     internal:manager by default — matches rates.write/partners.write), but
--     any specific manager login can be granted it from the permissions grid
--     the same way any other capability already can be.
--
--   assets.view — see and download. partner_admin and member both hold it by
--     default, since "sales team or account managers" (Charles's words) means
--     the ordinary reps and admins already logged into a partner's own
--     portal — there is no separate "account manager" role in this schema,
--     just a free-text Title (0015) on top of the same member/partner_admin
--     roles. Internal reads are never gated by a capability here, matching
--     payouts_read_internal/revshare_read_internal — an active internal login
--     always sees every partner's assets.
--
-- Files live in Supabase Storage, not a database column — a `partner-assets`
-- bucket, private, one object per row at `{partner_id}/{asset id}.pdf`. The
-- bucket's own file_size_limit and allowed_mime_types enforce "PDFs only" at
-- the storage layer, not just in a client-side accept="" attribute. Uploads,
-- downloads (via signed URL) and deletes all go through the session-scoped
-- client per src/lib/supabase/server.ts's own rule — nothing here reaches for
-- the service-role client, so the RLS policies below on storage.objects are
-- load-bearing, not decorative.

-- ---------------------------------------------------------------------------
-- capability_default() — add assets.view for partner_admin and member.
-- assets.write is intentionally absent from every role's default list except
-- internal:admin (which already holds `then true`, unconditionally, above).
-- Full replacement, not a diff: Postgres has no ALTER FUNCTION for a case
-- branch, and editing 0007_access.sql itself is off the table — it already
-- ran in production. Same pattern 0018_ongoing_revshare_comp.sql used to add
-- an arm to compute_partner_comp().
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
      p_key in ('payouts.view','revshare.view','people.write','exports.run','assets.view')

    -- Members: what they can see of their own numbers.
    when p_role = 'member' then
      p_key in ('spiffs.view','competitions.view','podium.view','assets.view')

    else false
  end
$$;

comment on function public.capability_default(text, text, text) is
  'Mirrors ROLE_DEFAULTS in src/lib/auth/capabilities.ts. Kept in step by supabase/tests/rls_test.sql.';

-- ---------------------------------------------------------------------------
-- partner_assets
-- ---------------------------------------------------------------------------
create table partner_assets (
  id            uuid primary key default gen_random_uuid(),
  partner_id    uuid not null references partners(id) on delete cascade,
  title         text not null check (btrim(title) <> ''),
  storage_path  text not null unique,
  file_size     bigint not null check (file_size >= 0),
  uploaded_by   uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index partner_assets_partner_idx on partner_assets (partner_id, created_at desc);

comment on column partner_assets.storage_path is
  'Object key in the partner-assets bucket: "{partner_id}/{this row''s id}.pdf". Never derived from the
   uploaded filename, so two uploads named the same thing never collide and nothing in the path is
   attacker-controlled.';

alter table partner_assets enable row level security;

create policy partner_assets_read_internal on partner_assets for select to authenticated
  using (my_role() = 'internal' and my_is_active());

create policy partner_assets_read_partner on partner_assets for select to authenticated
  using (
    my_role() in ('partner_admin','member')
    and partner_id = my_partner_id()
    and my_is_active()
    and has_cap('assets.view')
  );

create policy partner_assets_write on partner_assets for all to authenticated
  using      (my_role() = 'internal' and has_cap('assets.write'))
  with check (my_role() = 'internal' and has_cap('assets.write'));

-- ---------------------------------------------------------------------------
-- Storage: a private bucket, PDFs only, 25MB per file.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-assets', 'partner-assets', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

-- Mirrors partner_assets_read_* / partner_assets_write above exactly, keyed
-- off the partner id folder in the object path rather than a partner_id
-- column — storage.objects has no such column to policy against directly.
create policy partner_assets_storage_read on storage.objects for select to authenticated
  using (
    bucket_id = 'partner-assets'
    and (
      (public.my_role() = 'internal' and public.my_is_active())
      or (
        public.my_role() in ('partner_admin','member')
        and public.my_is_active()
        and public.has_cap('assets.view')
        and (storage.foldername(name))[1] = public.my_partner_id()::text
      )
    )
  );

create policy partner_assets_storage_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'partner-assets'
    and public.my_role() = 'internal'
    and public.has_cap('assets.write')
  );

create policy partner_assets_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'partner-assets'
    and public.my_role() = 'internal'
    and public.has_cap('assets.write')
  );
