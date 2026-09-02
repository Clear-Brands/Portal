'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActivePartner } from '@/lib/partner-context'
import { requireSession } from '@/lib/session'
import { can } from '@/lib/auth/capabilities'
import { listTeamOptions } from '@/lib/data/deals'
import { parseRosterCsv, restrictManagersToInternal } from '@/lib/roster/csv'
import type { ActionState } from '@/lib/actions/deals'

/**
 * Roster mutations.
 *
 * Editing, deactivating and CSV-importing people write the `people` table and
 * are gated on `people.write`, matching the policies in 0008_rls.sql.
 * Enabling a portal login is different: it has to create an auth account,
 * which only the service-role client can do, so it is one of the three
 * sanctioned callers of `createAdminClient()` — auth admin. Because that
 * client bypasses RLS entirely, this file does its own authorisation first,
 * using the session-scoped client to look the target person up. If that read
 * finds nothing, the admin call never happens — a partner admin genuinely
 * cannot reach a person outside their own partner this way, even though the
 * admin client itself would let them.
 */

/* -------------------------------------------------------------------------- */
/* Editing and deactivation                                                    */
/* -------------------------------------------------------------------------- */

const EditPerson = z.object({
  personId: z.guid(),
  name: z.string().trim().min(1, 'A name is required').max(160),
  email: z.email('Enter a valid email address'),
  teamId: z.string().trim().optional().default(''),
  title: z.string().trim().max(120).optional().default(''),
})

export async function editPerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'people.write')) {
    return { error: 'Editing the roster needs people permissions.' }
  }

  const parsed = EditPerson.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('people')
    .update({
      name: parsed.data.name,
      email: parsed.data.email,
      team_id: parsed.data.teamId || null,
      title: parsed.data.title || null,
    })
    .eq('id', parsed.data.personId)

  if (error) return { error: friendly(error.message) }

  revalidatePath('/roster')
  return { ok: 'Saved.' }
}

const SetActive = z.object({
  personId: z.guid(),
  active: z.enum(['true', 'false']),
})

export async function setPersonActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'people.write')) {
    return { error: 'Changing roster access needs people permissions.' }
  }

  const parsed = SetActive.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Something is missing there — try again.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('people')
    .update({ active: parsed.data.active === 'true' })
    .eq('id', parsed.data.personId)

  if (error) return { error: friendly(error.message) }

  revalidatePath('/roster')
  return {
    ok:
      parsed.data.active === 'true'
        ? 'Reactivated. They can sign back in right away.'
        : 'Deactivated — a pause, not a forfeiture. Earned money they are owed stays payable.',
  }
}

/* -------------------------------------------------------------------------- */
/* Enabling a portal login                                                     */
/* -------------------------------------------------------------------------- */

const EnableLogin = z.object({ personId: z.guid() })

export async function enablePortalLogin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'people.write')) {
    return { error: 'Enabling a login needs people permissions.' }
  }

  const parsed = EnableLogin.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Something is missing there — try again.' }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  // The authorisation check: only a person the caller can already read (their
  // own partner's roster, per RLS) is eligible. The admin client below never
  // sees anyone this lookup didn't already confirm.
  const supabase = await createClient()
  const { data: person } = await supabase
    .from('people')
    .select('id, name, email, active')
    .eq('id', parsed.data.personId)
    .eq('partner_id', partner.id)
    .maybeSingle()

  if (!person) return { error: 'That person could not be found.' }
  if (!person.active) return { error: 'Reactivate this person before giving them a login.' }

  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('person_id', person.id)
    .maybeSingle()
  if (existing) return { error: 'This person already has a portal login.' }

  const admin = createAdminClient()
  const { data: created, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    person.email as string,
    { redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite` },
  )

  if (inviteError || !created.user) {
    return { error: 'Could not send the invite. Check the email address and try again.' }
  }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: created.user.id,
    partner_id: partner.id,
    person_id: person.id,
    role: 'member',
    access: 'none',
    name: person.name,
    email: person.email,
  })

  if (profileError) {
    // Don't leave an auth account nothing points at.
    await admin.auth.admin.deleteUser(created.user.id)
    return { error: friendly(profileError.message) }
  }

  revalidatePath('/roster')
  return { ok: `Invite sent to ${person.email}.` }
}

/* -------------------------------------------------------------------------- */
/* Adding one person by hand                                                   */
/* -------------------------------------------------------------------------- */

const AddPerson = z.object({
  name: z.string().trim().min(1, 'A name is required').max(160),
  email: z.email('Enter a valid email address'),
  teamId: z.string().trim().optional().default(''),
  title: z.string().trim().max(120).optional().default(''),
  kind: z.enum(['rep', 'manager']).optional().default('rep'),
  createLogin: z.string().optional(),
})

/**
 * "Sometimes I just need to add one person, not a whole spreadsheet" —
 * Cristian, Loom walkthrough. The CSV importer stays for batches; this is the
 * one-at-a-time sibling, sharing its rules: kind = 'manager' is Clear Brands
 * staff only (same restriction `restrictManagersToInternal` applies to a CSV
 * row, and the same thing 0008_rls.sql's `people_write_partner_admin` policy
 * would refuse at the database layer regardless — checked here first so a
 * partner admin gets a clear reason instead of a raw policy-violation error).
 */
export async function addPerson(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'people.write')) {
    return { error: 'Adding to the roster needs people permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const parsed = AddPerson.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  if (parsed.data.kind === 'manager' && profile.role !== 'internal') {
    return { error: 'Only Clear Brands staff can add pod managers.' }
  }

  const email = parsed.data.email.toLowerCase()
  const supabase = await createClient()
  const { data: person, error } = await supabase
    .from('people')
    .insert({
      partner_id: partner.id,
      team_id: parsed.data.teamId || null,
      name: parsed.data.name,
      email,
      kind: parsed.data.kind,
      title: parsed.data.title || null,
      active: true,
    })
    .select('id, name, email')
    .single()

  if (error || !person) return { error: friendly(error?.message ?? '') }

  revalidatePath('/roster')

  if (parsed.data.createLogin !== 'on') {
    return { ok: `${person.name} added to the roster.` }
  }

  const admin = createAdminClient()
  const { data: created, error: inviteError } = await admin.auth.admin.inviteUserByEmail(person.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`,
  })

  if (inviteError || !created.user) {
    return { ok: `${person.name} added to the roster. Their login invite could not be sent — try "Send login invite" from their row.` }
  }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: created.user.id,
    partner_id: partner.id,
    person_id: person.id,
    role: 'member',
    access: 'none',
    name: person.name,
    email: person.email,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return { ok: `${person.name} added to the roster. Their login invite could not be sent — try "Send login invite" from their row.` }
  }

  return { ok: `${person.name} added to the roster. Invite sent to ${person.email}.` }
}

/* -------------------------------------------------------------------------- */
/* CSV import                                                                   */
/* -------------------------------------------------------------------------- */

export type ImportPreviewState = {
  error?: string
  preview?: {
    rows: {
      rowNumber: number
      name: string
      email: string
      podName: string
      kind: 'rep' | 'manager'
      status: 'ok' | 'duplicate' | 'invalid'
      reason?: string
    }[]
    truncated: boolean
    usedHeaders: boolean
    csvText: string
  }
}

const PreviewImport = z.object({ csvText: z.string().min(1, 'Choose a file first').max(4_000_000) })

export async function previewRosterImport(
  _prev: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  const profile = await requireSession()
  if (!can(profile, 'people.write')) {
    return { error: 'Importing people needs roster permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const parsed = PreviewImport.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Choose a CSV file first.' }
  }

  const supabase = await createClient()
  const [teams, existing] = await Promise.all([
    listTeamOptions(),
    supabase.from('people').select('email').eq('partner_id', partner.id),
  ])
  const existingEmails = new Set(((existing.data ?? []) as { email: string }[]).map((r) => r.email.toLowerCase()))

  const parsedResult = parseRosterCsv(parsed.data.csvText, teams, existingEmails)
  const restricted = restrictManagersToInternal(parsedResult.rows, profile.role === 'internal')

  return {
    preview: {
      rows: restricted.map((r) => ({
        rowNumber: r.rowNumber,
        name: r.name,
        email: r.email,
        podName: r.podName,
        kind: r.kind,
        status: r.status,
        reason: r.reason,
      })),
      truncated: parsedResult.truncated,
      usedHeaders: parsedResult.usedHeaders,
      csvText: parsed.data.csvText,
    },
  }
}

const CommitImport = z.object({
  csvText: z.string().min(1).max(4_000_000),
  includeRows: z.string().optional().default(''),
  createLogins: z.string().optional(),
})

/** One chunk's worth of rows for a bulk `people` insert — small enough that a
 * single bad row's fallback (see below) never has far to walk, large enough
 * that a 500-row import is a handful of round trips, not five hundred. */
const INSERT_CHUNK_SIZE = 100

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export type RosterCommitState = ActionState & {
  /** Newly-created people still waiting on a portal invite. The commit
   * itself never sends one — see sendRosterInviteBatch below for why. */
  pendingInvites?: { id: string; name: string; email: string }[]
}

/**
 * Inserts the selected rows into `people`. This used to also send each new
 * person's portal invite inline, one at a time — fine for the handful of
 * rows a manual add produces, but a real 500-row roster import made two
 * different things break at once: 500 sequential `inviteUserByEmail` calls
 * take far longer than a serverless function gets to run (Netlify's default
 * is 10s), so the request would simply time out partway through with no
 * record of where it stopped; and Supabase's own project-level email rate
 * limit — separate from whatever the SMTP provider allows — would start
 * silently failing invites well before row 500, caught only by the bare
 * `catch { continue }` that swallowed it.
 *
 * So this function's only job now is the `people` rows, done as a few bulk
 * upserts instead of 500 single-row inserts (fast, and `ignoreDuplicates`
 * means one duplicate-email race doesn't take its whole chunk down with it —
 * a chunk that fails outright falls back to inserting its rows one at a
 * time, so a genuinely bad row only costs that row, not the other 99 next to
 * it). Invite-sending, when requested, is handed off to the client as a
 * list of newly-created people; see sendRosterInviteBatch and
 * import-wizard.tsx for the batched, paced send that replaces the old loop.
 */
export async function commitRosterImport(
  _prev: RosterCommitState,
  formData: FormData,
): Promise<RosterCommitState> {
  const profile = await requireSession()
  if (!can(profile, 'people.write')) {
    return { error: 'Importing people needs roster permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const parsed = CommitImport.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Something went wrong reading that file — try again.' }

  const supabase = await createClient()
  const [teams, existing] = await Promise.all([
    listTeamOptions(),
    supabase.from('people').select('email').eq('partner_id', partner.id),
  ])
  const existingEmails = new Set(((existing.data ?? []) as { email: string }[]).map((r) => r.email.toLowerCase()))

  // The source of truth is always the raw text, re-parsed and re-validated
  // against the roster as it stands right now — never the client's memory of
  // an earlier preview.
  const { rows } = parseRosterCsv(parsed.data.csvText, teams, existingEmails)
  const restricted = restrictManagersToInternal(rows, profile.role === 'internal')

  const includeSet = new Set(
    parsed.data.includeRows
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n)),
  )
  const toInsert = restricted.filter((r) => r.status === 'ok' && includeSet.has(r.rowNumber))

  if (toInsert.length === 0) return { error: 'Nothing selected to import.' }

  const wantsLogins = parsed.data.createLogins === 'on'

  let imported = 0
  let failed = 0
  const insertedPeople: { id: string; name: string; email: string }[] = []

  for (const batch of chunk(toInsert, INSERT_CHUNK_SIZE)) {
    const rowsToUpsert = batch.map((row) => ({
      partner_id: partner.id,
      team_id: row.teamId,
      name: row.name,
      email: row.email,
      kind: row.kind,
      active: true,
    }))

    const { data, error } = await supabase
      .from('people')
      .upsert(rowsToUpsert, { onConflict: 'partner_id,email', ignoreDuplicates: true })
      .select('id, name, email')

    if (!error && data) {
      imported += data.length
      failed += batch.length - data.length
      insertedPeople.push(...(data as { id: string; name: string; email: string }[]))
      continue
    }

    // The whole chunk failed outright — rare (the rows are already validated
    // against duplicates and known pods above), but if it happens, fall back
    // to one row at a time so a single bad row only costs itself.
    for (const row of batch) {
      const { data: person, error: rowError } = await supabase
        .from('people')
        .insert({
          partner_id: partner.id,
          team_id: row.teamId,
          name: row.name,
          email: row.email,
          kind: row.kind,
          active: true,
        })
        .select('id, name, email')
        .single()

      if (rowError || !person) {
        failed++
        continue
      }
      imported++
      insertedPeople.push(person)
    }
  }

  revalidatePath('/roster')

  if (imported === 0) return { error: 'Nothing could be imported — try again.' }

  const parts = [`Imported ${imported} ${imported === 1 ? 'person' : 'people'}.`]
  if (failed > 0) parts.push(`${failed} row${failed === 1 ? '' : 's'} failed on save — nothing else changed for those.`)

  if (!wantsLogins || insertedPeople.length === 0) {
    return { ok: parts.join(' ') }
  }

  parts.push('Sending portal invites…')
  return { ok: parts.join(' '), pendingInvites: insertedPeople }
}

const InviteBatchInput = z.array(z.guid()).min(1).max(25)

export type InviteBatchItem = { personId: string; email: string; ok: boolean; message?: string }
export type InviteBatchResult = { results: InviteBatchItem[] } | { error: string }

/**
 * Sends portal invites for a small batch of already-created people, called
 * repeatedly by the client (see import-wizard.tsx) rather than once for an
 * entire import. Capped at 25 per call by design: each call is its own
 * request with its own timeout budget, and pacing calls from the client —
 * rather than looping 500 times inside one function invocation — is what
 * keeps a big import from timing out or outrunning Supabase's email rate
 * limit in the first place.
 *
 * Idempotent by construction: a person who already has a profile (an
 * earlier batch succeeded, or this batch is a retry) is reported ok without
 * sending a second invite, so re-running a partially-failed batch is safe.
 */
export async function sendRosterInviteBatch(personIds: string[]): Promise<InviteBatchResult> {
  const profile = await requireSession()
  if (!can(profile, 'people.write')) {
    return { error: 'Sending invites needs people permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const parsed = InviteBatchInput.safeParse(personIds)
  if (!parsed.success) return { error: 'Nothing to invite.' }

  // Same authorisation shape as enablePortalLogin above: only people this
  // session can already read (their own partner, per RLS) are eligible —
  // the admin client below never sees an id this lookup didn't confirm.
  const supabase = await createClient()
  const { data: people } = await supabase
    .from('people')
    .select('id, name, email, active')
    .eq('partner_id', partner.id)
    .in('id', parsed.data)

  const byId = new Map((people ?? []).map((p) => [p.id as string, p]))
  const admin = createAdminClient()
  const results: InviteBatchItem[] = []

  for (const id of parsed.data) {
    const person = byId.get(id)
    if (!person || !person.active) {
      results.push({ personId: id, email: person?.email ?? '', ok: false, message: 'Not found' })
      continue
    }

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('person_id', person.id)
      .maybeSingle()
    if (existingProfile) {
      results.push({ personId: id, email: person.email, ok: true, message: 'Already invited' })
      continue
    }

    const { data: created, error: inviteError } = await admin.auth.admin.inviteUserByEmail(person.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/accept-invite`,
    })

    if (inviteError || !created.user) {
      results.push({ personId: id, email: person.email, ok: false, message: 'Invite failed' })
      continue
    }

    const { error: profileError } = await admin.from('profiles').insert({
      user_id: created.user.id,
      partner_id: partner.id,
      person_id: person.id,
      role: 'member',
      access: 'none',
      name: person.name,
      email: person.email,
    })

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id)
      results.push({ personId: id, email: person.email, ok: false, message: 'Could not finish setup' })
      continue
    }

    results.push({ personId: id, email: person.email, ok: true })
  }

  return { results }
}

/* -------------------------------------------------------------------------- */

function friendly(message: string): string {
  if (message.includes('violates row-level security') || message.includes('42501')) {
    return 'You do not have permission to do that.'
  }
  if (message.includes('duplicate key') || message.includes('people_partner_id_email_key')) {
    return 'Someone with that email is already on the roster.'
  }
  if (/^[A-Z]/.test(message) && message.length < 200) return message
  return 'Something went wrong saving that. Try again, and tell Charles if it keeps happening.'
}
