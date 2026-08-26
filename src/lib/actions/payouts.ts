'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner } from '@/lib/partner-context'
import { requireSession } from '@/lib/session'
import { can } from '@/lib/auth/capabilities'
import type { ActionState } from '@/lib/actions/deals'

/**
 * Payout mutations.
 *
 * Neither of these computes a total. `record_payout()` in the database sums what
 * is payable and writes the batch atomically, so there is exactly one number
 * involved. The original calculated the total in JavaScript for the confirmation
 * dialog and the notification email, and again in SQL for the actual record —
 * two numbers for one transfer, free to disagree.
 */

const Record = z.object({
  reference: z
    .string()
    .trim()
    .min(1, 'Enter the ACH reference so this batch can be traced later')
    .max(120),
  /** Typed back by the user as a deliberate speed bump before money moves. */
  confirmTotal: z.string().trim().optional(),
})

export async function recordPayout(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'payouts.write')) {
    return { error: 'Recording a payout needs money permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const parsed = Record.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('record_payout', {
    p_partner_id: partner.id,
    p_reference: parsed.data.reference,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/payouts')
  revalidatePath('/deals')
  revalidatePath('/')
  return { ok: `Payout recorded against ${parsed.data.reference}.` }
}

const Void = z.object({
  payoutId: z.guid(),
  reason: z
    .string()
    .trim()
    .min(3, 'Say why this batch is being voided — it stays on the record')
    .max(300),
})

export async function voidPayout(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'payouts.write')) {
    return { error: 'Voiding a payout needs money permissions.' }
  }

  const parsed = Void.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'A reason is required.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('void_payout', {
    p_payout_id: parsed.data.payoutId,
    p_reason: parsed.data.reason,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/payouts')
  revalidatePath('/deals')
  revalidatePath('/')
  return { ok: 'Batch voided. Its deals are payable again and the line items are kept.' }
}

/** Correcting the reference or date on a batch that has already been recorded. */
const Amend = z.object({
  payoutId: z.guid(),
  reference: z.string().trim().min(1, 'A reference is required').max(120),
  paidDate: z.iso.date('Enter a valid date'),
})

export async function amendPayout(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'payouts.write')) {
    return { error: 'Editing a payout needs money permissions.' }
  }

  const parsed = Amend.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const supabase = await createClient()
  // Note what is not updatable: period, total, or any line item. Back-dating a
  // batch into a different month was how the original's one-per-month guard
  // could be walked past; `period` is set at record time and stays put.
  const { error } = await supabase
    .from('payouts')
    .update({ reference: parsed.data.reference, paid_date: parsed.data.paidDate })
    .eq('id', parsed.data.payoutId)

  if (error) return { error: friendly(error.message) }

  revalidatePath('/payouts')
  return { ok: 'Updated.' }
}

function friendly(message: string): string {
  if (message.includes('violates row-level security') || message.includes('42501')) {
    return 'You do not have permission to do that.'
  }
  if (message.includes('payouts_one_live_per_period')) {
    return 'A payout for this month is already recorded. Void it first if it needs correcting.'
  }
  if (/^[A-Z]/.test(message) && message.length < 200) return message
  return 'Something went wrong. Nothing was recorded — try again.'
}
