import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner } from '@/lib/partner-context'
import { toPayout, toPayoutLine, type Payout, type PayoutLine } from '@/lib/types'

/**
 * Payout reads.
 *
 * A batch keeps its line items forever, so the history can always answer "what
 * was in this transfer" — including for a voided one. In the original, voiding
 * nulled the link between the deals and the batch, which destroyed exactly that.
 */

export interface PayoutWithLines extends Payout {
  lines: PayoutLine[]
  perPerson: { personId: string | null; personName: string; teamName: string; amount: number }[]
}

export async function listPayouts(limitMonths = 24): Promise<Payout[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('payouts')
    .select('*')
    .eq('partner_id', partner.id)
    .order('paid_date', { ascending: false })
    .limit(limitMonths)

  return (data ?? []).map(toPayout)
}

export async function getPayout(id: string): Promise<PayoutWithLines | null> {
  const supabase = await createClient()

  const [{ data: header }, { data: lines }] = await Promise.all([
    supabase.from('payouts').select('*').eq('id', id).maybeSingle(),
    supabase.from('payout_lines').select('*').eq('payout_id', id).order('amount', {
      ascending: false,
    }),
  ])

  if (!header) return null

  const mapped = (lines ?? []).map(toPayoutLine)
  return { ...toPayout(header), lines: mapped, perPerson: rollUpByPerson(mapped) }
}

/** Line items grouped the way the transfer is actually distributed. */
export function rollUpByPerson(lines: PayoutLine[]) {
  const map = new Map<string, { personId: string | null; personName: string; teamName: string; amount: number }>()

  for (const line of lines) {
    const key = line.personId ?? `company:${line.personName}`
    const existing = map.get(key)
    if (existing) existing.amount += line.amount
    else
      map.set(key, {
        personId: line.personId,
        personName: line.personName,
        teamName: line.teamName,
        amount: line.amount,
      })
  }

  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

/** Lifetime paid and the current month's state, for the payouts header. */
export async function payoutHeadline(): Promise<{
  lifetimePaid: number
  batchesRecorded: number
  thisPeriodRecorded: Payout | null
}> {
  const partner = await getActivePartner()
  if (!partner) return { lifetimePaid: 0, batchesRecorded: 0, thisPeriodRecorded: null }

  const supabase = await createClient()

  const [{ data: rollup }, { data: period }] = await Promise.all([
    supabase
      .from('v_partner_rollup')
      .select('lifetime_paid')
      .eq('partner_id', partner.id)
      .maybeSingle(),
    supabase
      .from('payouts')
      .select('*')
      .eq('partner_id', partner.id)
      .is('voided_at', null)
      .order('paid_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const { count } = await supabase
    .from('payouts')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', partner.id)
    .is('voided_at', null)

  const latest = period ? toPayout(period) : null
  const currentPeriod = new Date().toISOString().slice(0, 7)

  return {
    lifetimePaid: Number(rollup?.lifetime_paid ?? 0),
    batchesRecorded: count ?? 0,
    thisPeriodRecorded: latest && latest.period === currentPeriod ? latest : null,
  }
}
