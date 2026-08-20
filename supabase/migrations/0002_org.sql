-- 0002_org.sql
-- The organisation model: partners -> departments -> pods (teams) -> people,
-- and the logins (profiles) that map auth accounts onto them.
--
-- Two deliberate departures from the original schema:
--
--  1. Identity is an auth account, not an email string. The original matched
--     `profiles.email = lower(auth.jwt()->>'email')` against a column admins
--     could freely edit, which meant renaming someone re-pointed their login
--     and there was no way to revoke a session. Here `profiles.user_id` is a
--     hard foreign key to auth.users; email is a display mirror.
--
--  2. A person's email is unique *within a partner*, not globally. The original
--     made reps.email globally unique, so two partner companies could never
--     both employ the same address.

-- ---------------------------------------------------------------------------
-- partners
-- ---------------------------------------------------------------------------
create table partners (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  citext not null unique,
  timezone              text not null default 'America/New_York',

  -- Programme configuration
  default_spiff         numeric(12,2) not null default 250 check (default_spiff >= 0),
  revshare_pct          numeric(6,3)  not null default 0 check (revshare_pct >= 0 and revshare_pct <= 100),

  -- The partner company's own per-close cut
  comp_mode             text not null default 'none' check (comp_mode in ('none','flat','pct')),
  comp_flat             numeric(12,2) not null default 0 check (comp_flat >= 0),
  comp_pct              numeric(6,3)  not null default 0 check (comp_pct >= 0 and comp_pct <= 100),
  comp_basis            text not null default 'first_month' check (comp_basis in ('first_month','contract')),

  -- Feature switches (per partner, all on by default)
  deals_enabled         boolean not null default true,
  spiffs_enabled        boolean not null default true,
  revshare_enabled      boolean not null default true,
  competitions_enabled  boolean not null default true,
  annual_enabled        boolean not null default true,

  -- Branding, so white-labelling later is a data change not a rewrite
  brand_accent          text not null default '#C8F52F'
                          check (brand_accent ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url              text,

  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index partners_active_idx on partners (archived_at) where archived_at is null;
create trigger partners_touch before update on partners
  for each row execute function public.touch_updated_at();

comment on column partners.timezone is
  'IANA timezone. All "today" arithmetic for this partner resolves here, not in UTC.';
comment on column partners.comp_basis is
  'Display-only in the original build. Kept, but the arithmetic in compute_partner_comp() now honours it.';

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------
create table departments (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete cascade,
  name        text not null,
  manager_ids uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (partner_id, name)
);

create index departments_partner_idx on departments (partner_id);
create trigger departments_touch before update on departments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- teams (called "pods" in the interface)
-- ---------------------------------------------------------------------------
create table teams (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references partners(id) on delete cascade,
  department_id  uuid references departments(id) on delete set null,
  name           text not null,
  color          text not null default '#6b6f76'
                   check (color ~ '^#[0-9A-Fa-f]{6}$'),
  manager_ids    uuid[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (partner_id, name)
);

create index teams_partner_idx on teams (partner_id);
create index teams_department_idx on teams (department_id);
create index teams_managers_idx on teams using gin (manager_ids);
create trigger teams_touch before update on teams
  for each row execute function public.touch_updated_at();

comment on column teams.color is
  'Constrained to a 6-digit hex literal. The original interpolated this value straight into a style
   attribute unescaped, which was a script-injection route for anyone with roster access.';

-- ---------------------------------------------------------------------------
-- people (the roster: reps and pod managers alike)
-- ---------------------------------------------------------------------------
create table people (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete cascade,
  team_id     uuid references teams(id) on delete set null,
  name        text not null check (length(btrim(name)) > 0),
  email       citext not null,
  kind        text not null default 'rep' check (kind in ('rep','manager')),
  active      boolean not null default true,
  perms       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Scoped to the partner, not global: two partner companies may both employ
  -- the same address.
  unique (partner_id, email)
);

create index people_partner_idx  on people (partner_id);
create index people_team_idx     on people (team_id);
create index people_active_idx   on people (partner_id, active);
create index people_name_trgm    on people using gin (name gin_trgm_ops);
create index people_email_trgm   on people using gin ((email::text) gin_trgm_ops);
create trigger people_touch before update on people
  for each row execute function public.touch_updated_at();

comment on table people is
  'Everyone on a partner roster. Existing here does not grant a login — that is a profiles row.';

-- ---------------------------------------------------------------------------
-- profiles (a login)
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  partner_id  uuid references partners(id) on delete cascade,
  person_id   uuid references people(id) on delete set null,

  role        text not null check (role in ('internal','partner_admin','member')),

  -- Internal staff only: 'admin' sees and does everything, 'manager' is scoped
  -- by perms. Anyone else is 'none'.
  access      text not null default 'none' check (access in ('admin','manager','none')),

  -- Granted capabilities, keyed by the capability names in src/lib/auth/capabilities.ts.
  -- Absent key means "fall back to the role default".
  perms       jsonb not null default '{}'::jsonb,

  name        text not null,
  email       citext not null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Internal staff belong to no partner; everyone else must.
  constraint profiles_partner_scope check (
    (role = 'internal'     and partner_id is null) or
    (role <> 'internal'    and partner_id is not null)
  ),
  -- Only internal staff carry an access level.
  constraint profiles_access_scope check (
    (role = 'internal' and access in ('admin','manager')) or
    (role <> 'internal' and access = 'none')
  ),
  -- A member login must point at a roster person.
  constraint profiles_member_person check (
    role <> 'member' or person_id is not null
  )
);

create index profiles_partner_idx on profiles (partner_id);
create index profiles_person_idx  on profiles (person_id);
create index profiles_role_idx    on profiles (role);
create unique index profiles_one_login_per_person on profiles (person_id)
  where person_id is not null;
create trigger profiles_touch before update on profiles
  for each row execute function public.touch_updated_at();

comment on column profiles.user_id is
  'Hard link to the auth account. Identity is this, never the email string.';
comment on column profiles.email is
  'Display mirror of the auth account email. Not an identity key, not globally unique.';
