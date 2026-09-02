'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSession } from '@/lib/session'
import { setActivePartner } from '@/lib/partner-context'
import {
  can,
  defaultKey,
  CAPABILITIES_APPLICABLE_TO,
  ROLE_DEFAULTS,
  type Capability,
  type Role,
} from '@/lib/auth/capabilities'
import type { ActionState } from '@/lib/actions/deals'

/**
 * Partner administration and permission management.
 *
 * `createAdminClient()` shows up once here, for the same reason it shows up
 * once in src/lib/actions/roster.ts: creating an auth account is one of the
 * three sanctioned uses (see src/lib/supabase/admin.ts). Everything else in
 * this file — the partner row, the initial pod, every settings and
 * permissions edit — goes through the session-scoped client, so RLS applies.
 */

/**
 * Switch which partner is "active" for a Clear Brands session — the cookie
 * getActivePartner() reads (src/lib/partner-context.ts). Nothing in the UI
 * called setActivePartner() before this; without it, an internal login had no
 * way to choose which partner /roster, /deals and /revshare meant, and always
 * fell back to whichever partner happened to be oldest.
 */
export async function switchActivePartner(formData: FormData) {
  const profile = await requireSession()
  if (profile.role !== 'internal') return

  const partnerId = String(formData.get('partnerId') ?? '')
  if (!partnerId) return

  await setActivePartner(partnerId)

  // The header switcher sends the page it was clicked from so switching
  // partners mid-task doesn't bounce you away from what you were looking at;
  // callers that don't set it (the partner detail page's "View their roster")
  // keep the original behaviour.
  const redirectTo = String(formData.get('redirectTo') ?? '/roster')
  redirect(redirectTo.startsWith('/') ? redirectTo : '/roster')
}

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                  */
/* -------------------------------------------------------------------------- */

const Onboard = z.object({
  name: z.string().trim().min(1, 'A partner name is required').max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and dashes only')
    .min(2)
    .max(60),
  timezone: z.string().trim().min(1).default('America/New_York'),
  defaultSpiff: z.coerce.number().min(0),
  podName: z.string().trim().min(1, 'Name the first pod').max(120),
  adminName: z.string().trim().min(1, 'The admin login needs a name').max(160),
  adminEmail: z.email('Enter a valid email address'),
})

export type OnboardState = { error?: string; ok?: string; partnerId?: string }

const onboardInitial: OnboardState = {}

export async function onboardPartner(_prev: OnboardState, formData: FormData): Promise<OnboardState> {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) {
    return { error: 'Onboarding a partner needs partner permissions.' }
  }

  const parsed = Onboard.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }
  const input = parsed.data

  const supabase = await createClient()

  const { data: partner, error: partnerError } = await supabase
    .from('partners')
    .insert({
      name: input.name,
      slug: input.slug,
      timezone: input.timezone,
      default_spiff: input.defaultSpiff,
    })
    .select('id, name')
    .single()

  if (partnerError || !partner) {
    return { error: friendly(partnerError?.message ?? 'Could not create the partner.') }
  }

  const { error: teamError } = await supabase
    .from('teams')
    .insert({ partner_id: partner.id, name: input.podName })

  if (teamError) {
    return {
      partnerId: partner.id as string,
      error: `${partner.name} was created, but the first pod could not be added: ${friendly(teamError.message)} Add one from the roster page.`,
    }
  }

  const invite = await inviteAdminLoginInternal(partner.id as string, input.adminName, input.adminEmail)
  if (invite.error) {
    return {
      partnerId: partner.id as string,
      error: `${partner.name} was created, but the admin invite failed: ${invite.error} Try again from the partner's page.`,
    }
  }

  revalidatePath('/partners')
  return { ok: `${partner.name} is onboarded. An invite went to ${input.adminEmail}.`, partnerId: partner.id as string }
}

const AddAdmin = z.object({
  partnerId: z.guid(),
  name: z.string().trim().min(1, 'A name is required').max(160),
  email: z.email('Enter a valid email address'),
})

/** A second (or replacement) admin login for a partner already onboarded. */
export async function addPartnerAdminLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) {
    return { error: 'Adding an admin login needs partner permissions.' }
  }

  const parsed = AddAdmin.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const result = await inviteAdminLoginInternal(parsed.data.partnerId, parsed.data.name, parsed.data.email)
  if (result.error) return { error: result.error }

  revalidatePath('/partners')
  return { ok: `Invite sent to ${parsed.data.email}.` }
}

/**
 * Shared by onboarding and "add another admin login": create the auth account,
 * then the profiles row. Not exported as its own form action — both callers
 * above do their own capability check first.
 */
async function inviteAdminLoginInternal(
  partnerId: string,
  name: string,
  email: string,
): Promise<{ error?: string }> {
  const admin = createAdminClient()

  const { data: created, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`,
  })

  if (inviteError || !created.user) {
    return { error: 'Could not send the invite. Check the email address and try again.' }
  }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: created.user.id,
    partner_id: partnerId,
    role: 'partner_admin',
    access: 'none',
    name,
    email,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: friendly(profileError.message) }
  }

  return {}
}

const EditAdmin = z.object({
  profileId: z.guid(),
  name: z.string().trim().min(1, 'A name is required').max(160),
})

/**
 * Renames a partner admin's login. Email is fixed to the address they were
 * invited with — changing an auth account's email needs its own
 * re-verification flow this doesn't have, so the path for a wrong email is
 * remove-and-reinvite, not edit.
 */
export async function editPartnerAdminLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) {
    return { error: 'Editing an admin login needs partner permissions.' }
  }

  const parsed = EditAdmin.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  // The admin client here mirrors inviteAdminLoginInternal below: a manager
  // can hold partners.write without holding profiles_write_admin (only an
  // internal admin does, per Fix 1 in 0014), so the RLS-scoped client would
  // reject this update for anyone but an admin even though the capability
  // check above already allowed it.
  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', parsed.data.profileId)
    .maybeSingle()

  if (!target || target.role !== 'partner_admin') {
    return { error: 'That login could not be found.' }
  }

  const { error } = await admin.from('profiles').update({ name: parsed.data.name }).eq('id', target.id)
  if (error) return { error: friendly(error.message) }

  revalidatePath('/partners')
  return { ok: 'Saved.' }
}

const RemoveAdmin = z.object({ profileId: z.guid() })

/**
 * Removes a partner admin login entirely — the auth account and the profiles
 * row both go, not just one. Deleting only the profiles row would leave a
 * dangling auth account that can still sign in and land on /not-on-roster;
 * that's confusing, not actually revoked. Uses the same admin client as
 * inviteAdminLoginInternal, for the same reason (see the comment on
 * editPartnerAdminLogin above) and because deleting an auth user is one of
 * this app's few sanctioned admin-client uses to begin with.
 */
export async function removePartnerAdminLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) {
    return { error: 'Removing an admin login needs partner permissions.' }
  }

  const parsed = RemoveAdmin.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Something is missing there — try again.' }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id, user_id, role')
    .eq('id', parsed.data.profileId)
    .maybeSingle()

  if (!target || target.role !== 'partner_admin') {
    return { error: 'That login could not be found.' }
  }
  if (target.user_id === profile.userId) {
    return { error: 'You cannot remove your own login — ask another admin.' }
  }

  const { error: profileError } = await admin.from('profiles').delete().eq('id', target.id)
  if (profileError) return { error: friendly(profileError.message) }

  // Best-effort: the profiles row is already gone (the part RLS and every
  // page actually check), so a failure here leaves an orphaned auth account
  // rather than a half-removed login. Not surfaced as an error since retrying
  // the whole action would just fail again on "profile not found."
  await admin.auth.admin.deleteUser(target.user_id)

  revalidatePath('/partners')
  return { ok: 'Removed.' }
}

const ResetAdminPassword = z.object({ profileId: z.guid() })

/**
 * Emails a partner admin a link to set a new password, for when they're
 * locked out rather than being removed and re-invited. Same link mechanics
 * as an invite — see /accept-invite and its /auth/set-session comment —
 * which is why this points at the same redirectTo: resetPasswordForEmail
 * generates a `type=recovery` link instead of `type=invite`, but the
 * tokens-in-a-fragment shape and the "set a password" step at the other end
 * are identical, so one page handles both.
 */
export async function sendPartnerAdminPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) {
    return { error: 'Resetting a login needs partner permissions.' }
  }

  const parsed = ResetAdminPassword.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Something is missing there — try again.' }

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('profiles')
    .select('id, role, email')
    .eq('id', parsed.data.profileId)
    .maybeSingle()

  if (!target || target.role !== 'partner_admin') {
    return { error: 'That login could not be found.' }
  }

  const { error } = await admin.auth.resetPasswordForEmail(target.email as string, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`,
  })
  if (error) return { error: 'Could not send the reset email. Try again.' }

  return { ok: `Sent a password reset to ${target.email}.` }
}

/* -------------------------------------------------------------------------- */
/* Clear Brands team                                                           */
/* -------------------------------------------------------------------------- */

const AddInternal = z.object({
  name: z.string().trim().min(1, 'A name is required').max(160),
  email: z.email('Enter a valid email address'),
  accessLevel: z.enum(['manager', 'admin']),
  title: z.string().trim().max(120).optional().default(''),
})

/**
 * Add a Clear Brands staff login — admin-only, same as everything else on
 * /clear-brands-team. There was no path to this before: 'internal' logins could
 * only ever be created by hand in SQL. Title is display-only (0015); what a
 * manager can actually do is still access + the permissions grid on this
 * same page.
 */
export async function addInternalLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!(profile.role === 'internal' && profile.access === 'admin')) {
    return { error: 'Adding a Clear Brands login needs admin access.' }
  }

  const parsed = AddInternal.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const admin = createAdminClient()
  const { data: created, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`,
  })

  if (inviteError || !created.user) {
    return { error: 'Could not send the invite. Check the email address and try again.' }
  }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: created.user.id,
    role: 'internal',
    access: parsed.data.accessLevel,
    title: parsed.data.title || null,
    name: parsed.data.name,
    email: parsed.data.email,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: friendly(profileError.message) }
  }

  revalidatePath('/clear-brands-team')
  return { ok: `Invite sent to ${parsed.data.email}.` }
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

const UpdateProfile = z.object({
  partnerId: z.guid(),
  name: z.string().trim().min(1, 'A partner name is required').max(160),
  timezone: z.string().trim().min(1),
  brandAccent: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a 6-digit hex colour like #C8F52F'),
  dealsEnabled: z.string().optional(),
  spiffsEnabled: z.string().optional(),
  revshareEnabled: z.string().optional(),
  competitionsEnabled: z.string().optional(),
  annualEnabled: z.string().optional(),
  selfServeDealsEnabled: z.string().optional(),
  signupDomains: z.string().trim().optional().default(''),
})

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

/** Turns "FieldPulse.com, @acme.io  bad domain" into a clean, deduped list of
 *  lowercase domains, silently dropping anything that isn't a real-looking
 *  domain rather than erroring — this is a comma/space-separated free-text
 *  field, not a strict form. */
function parseSignupDomains(raw: string): string[] {
  const seen = new Set<string>()
  for (const piece of raw.split(/[,\s]+/)) {
    const domain = piece.trim().toLowerCase().replace(/^@/, '')
    if (domain && DOMAIN_RE.test(domain)) seen.add(domain)
  }
  return [...seen]
}

/** Branding and feature toggles — everything except rates. */
export async function updatePartnerProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) {
    return { error: 'Editing a partner needs partner permissions.' }
  }

  const parsed = UpdateProfile.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }
  const input = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('partners')
    .update({
      name: input.name,
      timezone: input.timezone,
      brand_accent: input.brandAccent,
      deals_enabled: input.dealsEnabled === 'on',
      spiffs_enabled: input.spiffsEnabled === 'on',
      revshare_enabled: input.revshareEnabled === 'on',
      competitions_enabled: input.competitionsEnabled === 'on',
      annual_enabled: input.annualEnabled === 'on',
      self_serve_deals_enabled: input.selfServeDealsEnabled === 'on',
      signup_domains: parseSignupDomains(input.signupDomains),
    })
    .eq('id', input.partnerId)

  if (error) return { error: friendly(error.message) }

  revalidatePath(`/partners/${input.partnerId}`)
  revalidatePath('/partners')
  return { ok: 'Saved.' }
}

const UpdateRates = z.object({
  partnerId: z.guid(),
  defaultSpiff: z.coerce.number().min(0),
  revsharePct: z.coerce.number().min(0).max(100),
  compMode: z.enum(['none', 'flat', 'pct', 'ongoing_pct']),
  compFlat: z.coerce.number().min(0),
  compPct: z.coerce.number().min(0).max(100),
  compBasis: z.enum(['first_month', 'contract']),
})

/** Rate changes — a separate capability from the rest of a partner's settings. */
export async function updatePartnerRates(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'rates.write')) {
    return { error: 'Changing rates needs rate permissions.' }
  }

  const parsed = UpdateRates.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }
  const input = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('partners')
    .update({
      default_spiff: input.defaultSpiff,
      revshare_pct: input.revsharePct,
      comp_mode: input.compMode,
      comp_flat: input.compFlat,
      comp_pct: input.compPct,
      comp_basis: input.compBasis,
    })
    .eq('id', input.partnerId)

  if (error) return { error: friendly(error.message) }

  revalidatePath(`/partners/${input.partnerId}`)
  revalidatePath('/partners')
  return { ok: 'Rates updated.' }
}

/* -------------------------------------------------------------------------- */
/* Archive / restore                                                           */
/* -------------------------------------------------------------------------- */

const PartnerIdOnly = z.object({ partnerId: z.guid() })

export async function archivePartner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) {
    return { error: 'Archiving a partner needs partner permissions.' }
  }

  const parsed = PartnerIdOnly.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Something is missing there — try again.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('archive_partner', { p_partner_id: parsed.data.partnerId })
  if (error) return { error: friendly(error.message) }

  revalidatePath('/partners')
  return { ok: 'Archived. Their programme pauses; nothing is deleted.' }
}

export async function restorePartner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'partners.write')) {
    return { error: 'Restoring a partner needs partner permissions.' }
  }

  const parsed = PartnerIdOnly.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Something is missing there — try again.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('restore_partner', { p_partner_id: parsed.data.partnerId })
  if (error) return { error: friendly(error.message) }

  revalidatePath('/partners')
  return { ok: 'Restored.' }
}

/* -------------------------------------------------------------------------- */
/* Permissions                                                                 */
/* -------------------------------------------------------------------------- */

const UpdatePerms = z.object({
  profileId: z.guid(),
  scope: z.string().min(1),
})

/**
 * Grant or revoke capabilities on one login.
 *
 * Authorisation mirrors the RLS split exactly: a Clear Brands admin may edit
 * any profile (profiles_write_admin, 0014); a partner admin may edit only
 * their own members (profiles_update_partner_admin, 0008) — never another
 * partner's, never their own or a co-admin's. Editing your own row is refused
 * even for an admin, so nobody can lock themselves out of the one screen that
 * would undo it.
 *
 * Only the capabilities the grid actually rendered (`scope`) are touched, and
 * only when they differ from that login's role default — the same
 * grant/revoke-an-override semantics `can()` already implements, so the
 * stored perms object stays a diff, not a duplicate of the defaults.
 */
export async function updateProfilePerms(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()

  const parsed = UpdatePerms.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Something is missing there — try again.' }

  const supabase = await createClient()
  const { data: target } = await supabase
    .from('profiles')
    .select('id, user_id, role, access, partner_id, perms')
    .eq('id', parsed.data.profileId)
    .maybeSingle()

  if (!target) return { error: 'That login could not be found.' }
  if (target.user_id === profile.userId) {
    return { error: 'You cannot change your own permissions — ask another admin.' }
  }

  const isAdmin = profile.role === 'internal' && profile.access === 'admin'
  const isOwnMember =
    profile.role === 'partner_admin' &&
    can(profile, 'people.write') &&
    target.role === 'member' &&
    target.partner_id === profile.partnerId

  if (!isAdmin && !isOwnMember) {
    return { error: 'You do not have permission to change that login.' }
  }

  const targetRole = target.role as Role
  const applicable = new Set(CAPABILITIES_APPLICABLE_TO[targetRole] ?? [])
  const defaults = ROLE_DEFAULTS[defaultKey(targetRole, target.access)] ?? []
  const nextPerms: Record<string, boolean> = { ...(target.perms as Record<string, boolean>) }

  for (const key of parsed.data.scope.split(',').filter(Boolean) as Capability[]) {
    // Never trust the scope list alone — only ever touch a capability that
    // actually applies to this login's role, no matter what the form sent.
    if (!applicable.has(key)) continue

    const checked = formData.get(`cap.${key}`) === 'on'
    const isDefault = defaults.includes(key)
    if (checked === isDefault) delete nextPerms[key]
    else nextPerms[key] = checked
  }

  const { error } = await supabase.from('profiles').update({ perms: nextPerms }).eq('id', target.id)
  if (error) return { error: friendly(error.message) }

  revalidatePath('/partners')
  return { ok: 'Permissions updated.' }
}

/* -------------------------------------------------------------------------- */

function friendly(message: string): string {
  if (message.includes('violates row-level security') || message.includes('42501')) {
    return 'You do not have permission to do that.'
  }
  if (message.includes('partners_slug_key') || message.includes('duplicate key')) {
    return 'That slug is already taken — try another.'
  }
  if (/^[A-Z]/.test(message) && message.length < 200) return message
  return 'Something went wrong saving that. Try again, and tell Charles if it keeps happening.'
}
