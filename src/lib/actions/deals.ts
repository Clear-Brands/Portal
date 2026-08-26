'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner, setActivePartner } from '@/lib/partner-context'
import { requireSession } from '@/lib/session'
import { can } from '@/lib/auth/capabilities'
import { DEAL_STATUSES } from '@/lib/types'

/**
 * Deal mutations.
 *
 * Three properties every action here holds, none of which the original had:
 *
 *   1. Permission is checked on the server before anything runs, and the
 *      database checks again underneath.
 *   2. There is one door per operation. In the original, four button handlers
 *      wrote status directly and bypassed the guarded transition entirely, so
 *      the "this deal is in a recorded payout" lock could simply be walked past.
 *   3. Money is never taken from the request. The spiff comes from the partner's
 *      configured rate; a submitted amount is ignored, not trusted.
 */

export type ActionState = { error?: string; ok?: string }

/* -------------------------------------------------------------------------- */
/* Adding a deal                                                               */
/* -------------------------------------------------------------------------- */

const NewDeal = z.object({
  personId: z.guid('Choose which rep this referral belongs to'),
  clientName: z.string().trim().min(1, 'A client name is required').max(160),
  service: z.string().trim().max(80).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  state: z.string().trim().max(2).optional().default(''),
  contact: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(160).optional().default(''),
  promoNote: z.string().trim().max(500).optional().default(''),
  // Optional overrides, honoured only for callers holding rates.write.
  spiffAmount: z.coerce.number().min(0).max(1_000_000).optional(),
  dealValue: z.coerce.number().min(0).max(10_000_000).optional(),
  monthlyValue: z.coerce.number().min(0).max(1_000_000).optional(),
})

export async function addDeal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'deals.write')) {
    return { error: 'You do not have permission to add deals.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const parsed = NewDeal.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const input = parsed.data
  const supabase = await createClient()

  // The rate comes from the partner unless the caller may set rates. A value in
  // the form from someone without that capability is discarded, not rejected —
  // there is no legitimate way for it to have got there.
  const mayPrice = can(profile, 'rates.write')
  const spiff = mayPrice && input.spiffAmount != null ? input.spiffAmount : partner.defaultSpiff

  const { error } = await supabase.from('deals').insert({
    partner_id: partner.id,
    person_id: input.personId,
    client_name: input.clientName,
    service: input.service,
    city: input.city,
    state: input.state.toUpperCase(),
    contact: input.contact,
    phone: input.phone,
    email: input.email,
    promo_note: input.promoNote,
    status: 'submitted',
    spiff_amount: spiff,
    deal_value: mayPrice ? (input.dealValue ?? 0) : 0,
    monthly_value: mayPrice ? (input.monthlyValue ?? 0) : 0,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/deals')
  revalidatePath('/')
  return { ok: `${input.clientName} added.` }
}

/* -------------------------------------------------------------------------- */
/* Moving a deal                                                               */
/* -------------------------------------------------------------------------- */

// z.guid() checks the same hex-dash-hex shape Postgres's uuid column
// enforces. z.uuid() additionally demands a valid RFC4122 version/variant
// nibble — seed data's deterministic pseudo-ids (pg_temp.sid() in
// supabase/seed.sql) don't follow that convention, so every action taking
// an id here uses z.guid() rather than reject real, valid rows as
// "Invalid UUID." (Found live: editing Anchor Plumbing Co's monthly value
// on Rev share failed with "Invalid input" for exactly this reason.)
const Transition = z.object({
  dealId: z.guid(),
  status: z.enum(DEAL_STATUSES),
  lostReason: z.string().trim().max(300).optional().default(''),
})

export async function transitionDeal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'deals.write')) {
    return { error: 'You do not have permission to move deals.' }
  }

  const parsed = Transition.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That status is not valid.' }
  }

  if (parsed.data.status === 'paid') {
    return {
      error:
        'Deals become Paid by recording a payout, not by moving them. Use Record payout on the Payouts tab.',
    }
  }

  if (parsed.data.status === 'lost' && !parsed.data.lostReason) {
    return { error: 'Give a reason so the rep can see why the deal was closed out.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('transition_deal', {
    p_deal_id: parsed.data.dealId,
    p_status: parsed.data.status,
    p_lost_reason: parsed.data.lostReason,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/deals')
  revalidatePath('/deals/pipeline')
  revalidatePath('/payouts')
  revalidatePath('/')
  return { ok: 'Deal updated.' }
}

/* -------------------------------------------------------------------------- */
/* Editing details                                                             */
/* -------------------------------------------------------------------------- */

const EditDeal = z.object({
  dealId: z.guid(),
  clientName: z.string().trim().min(1, 'A client name is required').max(160),
  service: z.string().trim().max(80).optional().default(''),
  personId: z.guid().optional(),
  city: z.string().trim().max(80).optional().default(''),
  state: z.string().trim().max(2).optional().default(''),
  contact: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(160).optional().default(''),
  promoNote: z.string().trim().max(500).optional().default(''),
})

export async function editDeal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'deals.write')) {
    return { error: 'You do not have permission to edit deals.' }
  }

  const parsed = EditDeal.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const { dealId, ...fields } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase
    .from('deals')
    .update({
      client_name: fields.clientName,
      service: fields.service,
      ...(fields.personId ? { person_id: fields.personId } : {}),
      city: fields.city,
      state: fields.state.toUpperCase(),
      contact: fields.contact,
      phone: fields.phone,
      email: fields.email,
      promo_note: fields.promoNote,
    })
    .eq('id', dealId)

  if (error) return { error: friendly(error.message) }

  revalidatePath('/deals')
  return { ok: 'Saved.' }
}

/**
 * Adjusting a spiff is a rate decision, separate from editing client details —
 * which is why it has its own capability and its own action.
 */
const AdjustSpiff = z.object({
  dealId: z.guid(),
  spiffAmount: z.coerce.number().min(0, 'A spiff cannot be negative').max(1_000_000),
})

export async function adjustSpiff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'rates.write')) {
    return { error: 'Changing a spiff amount needs rate permissions.' }
  }

  const parsed = AdjustSpiff.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a valid amount.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('deals')
    .update({ spiff_amount: parsed.data.spiffAmount })
    .eq('id', parsed.data.dealId)
    .in('status', ['submitted', 'in_talks', 'closed'])

  if (error) return { error: friendly(error.message) }

  revalidatePath('/deals')
  revalidatePath('/payouts')
  return { ok: 'Spiff updated.' }
}

/* -------------------------------------------------------------------------- */
/* Approving a flat-fee deal's comp                                            */
/* -------------------------------------------------------------------------- */

/**
 * The one-time approval a flat-fee partner's deal needs before it can be
 * swept into a payout — see 0016_flat_fee_approval.sql. Gated on the same
 * capability as recording a payout, since this decides what a payout is
 * allowed to include.
 */
const ApproveComp = z.object({ dealId: z.guid() })

export async function approveDealComp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'payouts.write')) {
    return { error: 'Approving a payout needs payout permissions.' }
  }

  const parsed = ApproveComp.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Something is missing there — try again.' }
  }

  const supabase = await createClient()

  // Read before approving, only to phrase the confirmation — approve_deal_comp
  // itself is the source of truth for what actually happens.
  const { data: before } = await supabase
    .from('deals')
    .select('ongoing_revshare')
    .eq('id', parsed.data.dealId)
    .maybeSingle()

  const { error } = await supabase.rpc('approve_deal_comp', { p_deal_id: parsed.data.dealId })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/payouts')
  revalidatePath('/revshare')
  return {
    ok: before?.ongoing_revshare
      ? 'Approved — now accruing on the Rev share page.'
      : 'Approved — it will be included in the next payout.',
  }
}

/* -------------------------------------------------------------------------- */
/* A member submitting their own referral                                      */
/* -------------------------------------------------------------------------- */

const SubmitDeal = z.object({
  clientName: z.string().trim().min(1, 'Tell us who the client is').max(160),
  service: z.string().trim().max(80).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  state: z.string().trim().max(2).optional().default(''),
  contact: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(160).optional().default(''),
  note: z.string().trim().max(500).optional().default(''),
})

export async function submitDeal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession()

  const parsed = SubmitDeal.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('submit_deal', {
    p_client: parsed.data.clientName,
    p_service: parsed.data.service,
    p_city: parsed.data.city,
    p_state: parsed.data.state,
    p_contact: parsed.data.contact,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email,
    p_note: parsed.data.note,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/my-deals')
  revalidatePath('/')
  return { ok: `${parsed.data.clientName} sent to Clear Brands.` }
}

/* -------------------------------------------------------------------------- */
/* Switching partner program                                                   */
/* -------------------------------------------------------------------------- */

export async function switchPartner(formData: FormData): Promise<void> {
  const profile = await requireSession()
  if (profile.role !== 'internal') return

  const partnerId = String(formData.get('partnerId') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(partnerId)) return

  await setActivePartner(partnerId)
  revalidatePath('/', 'layout')
}

/* -------------------------------------------------------------------------- */

/**
 * Turn a Postgres error into something worth reading.
 *
 * The messages raised by the RPCs in 0010 are already written for people, so
 * they pass through. Constraint violations are translated; anything unexpected
 * gets a neutral message rather than leaking internals to the browser.
 */
function friendly(message: string): string {
  if (message.includes('deals_lost_needs_reason')) {
    return 'A lost deal needs a reason.'
  }
  if (message.includes('deals_payout_only_when_paid')) {
    return 'That deal is part of a recorded payout. Void the payout first.'
  }
  if (message.includes('violates row-level security') || message.includes('42501')) {
    return 'You do not have permission to do that.'
  }
  if (message.includes('duplicate key')) {
    return 'That already exists.'
  }
  // The RPCs raise plain-language exceptions on purpose; show those as-is.
  if (/^[A-Z]/.test(message) && message.length < 200) return message

  return 'Something went wrong saving that. Try again, and tell Charles if it keeps happening.'
}
