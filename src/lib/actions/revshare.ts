'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner, partnerToday } from '@/lib/partner-context'
import { requireSession } from '@/lib/session'
import { can } from '@/lib/auth/capabilities'
import { listLiveAccounts } from '@/lib/data/revshare'
import type { ActionState } from '@/lib/actions/deals'

/**
 * Rev share mutations.
 *
 * Recording and voiding a statement are gated on `revshare.write`, matching
 * both `record_revshare()`/`void_revshare()`'s own internal checks and the RLS
 * policies on revshare_statements — same capability, checked twice. Marking an
 * account live/churned and opting a closed deal into the programme write the
 * `deals` table instead, so those are gated on `deals.write`, the capability
 * that table's policies actually key on.
 */

const Record = z.object({
  reference: z.string().trim().min(1, 'Enter the ACH reference so this statement can be traced later').max(120),
})

export async function recordRevshareStatement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'revshare.write')) {
    return { error: 'Recording a rev-share statement needs money permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const parsed = Record.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  // The set of deals is read fresh here rather than trusted from the form —
  // the confirmation dialog shows what was live a render ago, this is what is
  // live right now.
  const accounts = await listLiveAccounts()
  const dealIds = accounts.map((a) => a.dealId)
  if (dealIds.length === 0) {
    return { error: 'No live accounts to bill right now.' }
  }

  const today = await partnerToday()
  const period = today.slice(0, 7)

  const supabase = await createClient()
  const { error } = await supabase.rpc('record_revshare', {
    p_partner_id: partner.id,
    p_period: period,
    p_reference: parsed.data.reference,
    p_deal_ids: dealIds,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/revshare')
  revalidatePath('/')
  return { ok: `Statement recorded against ${parsed.data.reference}.` }
}

const Void = z.object({
  statementId: z.uuid(),
  reason: z.string().trim().min(3, 'Say why this statement is being voided — it stays on the record').max(300),
})

export async function voidRevshareStatement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'revshare.write')) {
    return { error: 'Voiding a rev-share statement needs money permissions.' }
  }

  const parsed = Void.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'A reason is required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('void_revshare', {
    p_statement_id: parsed.data.statementId,
    p_reason: parsed.data.reason,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/revshare')
  return { ok: 'Statement voided.' }
}

/* -------------------------------------------------------------------------- */
/* The deals side of the programme — live/churned, and opting a deal in.       */
/* -------------------------------------------------------------------------- */

const SetLive = z.object({
  dealId: z.uuid(),
  live: z.enum(['true', 'false']),
})

export async function setAccountLiveState(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'deals.write')) {
    return { error: 'Changing an account needs deal permissions.' }
  }

  const parsed = SetLive.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Something is missing there — try again.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('deals')
    .update({ live: parsed.data.live === 'true' })
    .eq('id', parsed.data.dealId)

  if (error) return { error: friendly(error.message) }

  revalidatePath('/revshare')
  return { ok: parsed.data.live === 'true' ? 'Marked live.' : 'Marked churned.' }
}

const AddToProgramme = z.object({
  dealId: z.uuid(),
  monthlyValue: z.coerce.number().positive('Enter a monthly value greater than zero').max(1_000_000),
})

export async function addDealToRevshareProgramme(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'deals.write')) {
    return { error: 'Adding an account needs deal permissions.' }
  }

  const parsed = AddToProgramme.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('deals')
    .update({ monthly_value: parsed.data.monthlyValue, live: true })
    .eq('id', parsed.data.dealId)
    .in('status', ['closed', 'paid'])
    .eq('monthly_value', 0)

  if (error) return { error: friendly(error.message) }

  revalidatePath('/revshare')
  return { ok: 'Added to the rev-share programme.' }
}

/* -------------------------------------------------------------------------- */

function friendly(message: string): string {
  if (message.includes('violates row-level security') || message.includes('42501')) {
    return 'You do not have permission to do that.'
  }
  if (message.includes('revshare_one_live_per_period') || message.includes('duplicate key')) {
    return 'A statement for this month is already recorded. Void it first if it needs correcting.'
  }
  if (/^[A-Z]/.test(message) && message.length < 200) return message
  return 'Something went wrong. Nothing was recorded — try again.'
}
