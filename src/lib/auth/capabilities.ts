/**
 * The capability vocabulary.
 *
 * This file and `capability_default()` in supabase/migrations/0007_access.sql are
 * the same model expressed twice — once for the interface, once for the database.
 * supabase/tests/30_capabilities.sql asserts they agree, so they cannot drift.
 *
 * The original build had four overlapping permission systems and enforced two of
 * roughly twenty keys. Unchecking a box hid a button and changed nothing else.
 * Here, every capability below is checked on the server before an action runs AND
 * gates a row-level security policy underneath it.
 */

export const ROLES = ['internal', 'partner_admin', 'member'] as const
export type Role = (typeof ROLES)[number]

export const ACCESS_LEVELS = ['admin', 'manager', 'none'] as const
export type Access = (typeof ACCESS_LEVELS)[number]

/** Capabilities held by a login. */
export const CAPABILITIES = {
  'deals.write': 'Add, edit and move referrals',
  'people.write': 'Manage the roster, pods and departments',
  'programs.write': 'Create competitions, sprints and goals',
  'partners.write': 'Onboard, edit and archive partner companies',
  'rates.write': 'Change spiff rates and per-close compensation',
  'payouts.write': 'Record and void payouts, approve goal prizes',
  'payouts.view': 'See payout history and amounts',
  'revshare.write': 'Record and void rev-share statements',
  'revshare.view': 'See rev-share statements',
  'activity.view': 'Read the activity log',
  'exports.run': 'Download exports',
  'spiffs.view': 'See spiff amounts',
  'competitions.view': 'See competitions and sprints',
  'podium.view': 'See the 30-day podium',
} as const

export type Capability = keyof typeof CAPABILITIES

/** Capabilities held by a pod manager, stored on their roster row. */
export const POD_CAPABILITIES = {
  'pod.people.write': 'Add and edit people in their own pods',
  'pod.numbers.view': 'See production numbers for their own pods',
  'pod.money.view': 'See spiff amounts for their own pods',
} as const

export type PodCapability = keyof typeof POD_CAPABILITIES

/**
 * What each role holds when a capability has not been explicitly granted or
 * revoked. Mirrors capability_default() in 0007_access.sql exactly.
 */
export const ROLE_DEFAULTS: Record<string, readonly Capability[]> = {
  // Clear Brands admins hold everything.
  'internal:admin': Object.keys(CAPABILITIES) as Capability[],

  // Clear Brands managers: day-to-day work, no money writes.
  'internal:manager': [
    'deals.write',
    'people.write',
    'programs.write',
    'exports.run',
    'activity.view',
  ],

  // Partner admins: their own organisation, money read-only.
  partner_admin: ['payouts.view', 'revshare.view', 'people.write', 'exports.run'],

  // Members: what they can see of their own numbers.
  member: ['spiffs.view', 'competitions.view', 'podium.view'],
} as const

export const POD_DEFAULTS: Record<PodCapability, boolean> = {
  'pod.people.write': true,
  'pod.numbers.view': true,
  'pod.money.view': false,
}

export interface SessionProfile {
  id: string
  userId: string
  role: Role
  access: Access
  partnerId: string | null
  personId: string | null
  name: string
  email: string
  perms: Record<string, boolean>
  /** False when the member's roster row has been deactivated. */
  active: boolean
}

export function defaultKey(role: Role, access: Access): string {
  return role === 'internal' ? `internal:${access}` : role
}

/**
 * Which capabilities can change anything for a given role — the table the
 * permissions grid (Phase 04, `/partners`) renders from, so it can never offer
 * a checkbox that no policy and no page ever consults.
 *
 * Built by reading every place a capability is actually checked, not by
 * guessing from the vocabulary:
 *
 *   - `deals.write`, `programs.write`, `partners.write`, `rates.write`,
 *     `payouts.write`, `revshare.write` gate policies written against
 *     `my_role() = 'internal'` only (0008_rls.sql) — internal-only.
 *   - `people.write` also gates the partner-admin people/profile policies
 *     (`people_write_partner_admin` and siblings) — internal and partner_admin.
 *   - `payouts.view`, `revshare.view`, `activity.view` gate policies that
 *     explicitly branch on `partner_admin`; `revshare.view` and
 *     `activity.view` do not extend to `member` the way `payouts.view` does.
 *   - `exports.run`, `spiffs.view`, `competitions.view`, `podium.view` are
 *     checked in the application layer (export routes, nav visibility, the
 *     dashboard's podium and money columns) rather than in RLS, and apply to
 *     whichever roles those surfaces actually render for.
 */
export const CAPABILITIES_APPLICABLE_TO: Record<Role, Capability[]> = {
  internal: [
    'deals.write',
    'people.write',
    'programs.write',
    'partners.write',
    'rates.write',
    'payouts.write',
    'payouts.view',
    'revshare.write',
    'revshare.view',
    'activity.view',
    'exports.run',
    'spiffs.view',
    'competitions.view',
    'podium.view',
  ],
  partner_admin: [
    'people.write',
    'payouts.view',
    'revshare.view',
    'activity.view',
    'exports.run',
    'spiffs.view',
    'competitions.view',
    'podium.view',
  ],
  member: ['payouts.view', 'exports.run', 'spiffs.view', 'competitions.view', 'podium.view'],
}

/**
 * Resolve one capability for a profile.
 *
 * Never call this to decide whether an action is *allowed* — call it to decide
 * what to render. The server action and the database policy are what allow.
 */
export function can(profile: SessionProfile | null, capability: Capability): boolean {
  if (!profile) return false
  if (!profile.active) return false

  const explicit = profile.perms?.[capability]
  if (typeof explicit === 'boolean') return explicit

  const defaults = ROLE_DEFAULTS[defaultKey(profile.role, profile.access)] ?? []
  return defaults.includes(capability)
}

export function canPod(
  perms: Record<string, boolean> | null | undefined,
  capability: PodCapability,
): boolean {
  const explicit = perms?.[capability]
  if (typeof explicit === 'boolean') return explicit
  return POD_DEFAULTS[capability]
}

/** Every capability a profile currently holds, for rendering permission grids. */
export function grantedCapabilities(profile: SessionProfile | null): Capability[] {
  if (!profile) return []
  return (Object.keys(CAPABILITIES) as Capability[]).filter((c) => can(profile, c))
}

export function isInternalAdmin(profile: SessionProfile | null): boolean {
  return profile?.role === 'internal' && profile.access === 'admin'
}
