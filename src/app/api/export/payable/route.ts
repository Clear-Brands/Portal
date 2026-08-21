import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner, partnerToday } from '@/lib/partner-context'
import { batchTotals, groupBatchByPerson, listPayableBatch } from '@/lib/data/deals'
import { buildWorkbook, exportFilename, xlsxResponse } from '@/lib/exports/workbook'

/**
 * The pre-payment review sheet: what the partner checks before the ACH goes out.
 * Grouped by pod with subtotals, then a grand total.
 */
export async function GET() {
  const profile = await requireSession()
  if (!can(profile, 'exports.run')) return new Response('Not permitted', { status: 403 })

  const partner = await getActivePartner()
  const today = await partnerToday()
  const lines = await listPayableBatch()
  const totals = batchTotals(lines)
  const perPerson = groupBatchByPerson(lines)

  const byTeam = new Map<string, typeof perPerson>()
  for (const p of perPerson) {
    const key = p.teamName ?? 'No pod'
    byTeam.set(key, [...(byTeam.get(key) ?? []), p])
  }

  const rows: Record<string, unknown>[] = []
  const groups: { atIndex: number; label: string }[] = []

  for (const [teamName, members] of byTeam) {
    groups.push({ atIndex: rows.length, label: teamName })
    for (const m of members) {
      rows.push({ person: m.personName, team: teamName, deals: m.deals, amount: m.amount })
    }
    rows.push({
      person: `${teamName} subtotal`,
      team: '',
      deals: members.reduce((n, m) => n + m.deals, 0),
      amount: members.reduce((n, m) => n + m.amount, 0),
    })
  }

  const buffer = await buildWorkbook([
    {
      name: 'Payable',
      title: `${partner?.name ?? 'Partner'} — batch ready to pay`,
      subtitle: `As of ${today}. Money moves by ACH from your bank; this is the distribution.`,
      columns: [
        { header: 'Person', key: 'person', width: 26 },
        { header: 'Pod', key: 'team', width: 20 },
        { header: 'Deals', key: 'deals', width: 10 },
        { header: 'Amount', key: 'amount', money: true },
      ],
      rows,
      groups,
      totals: {
        person: 'TOTAL TO TRANSFER',
        deals: totals.deals,
        amount: totals.total,
      },
    },
  ])

  return xlsxResponse(buffer, exportFilename(`${partner?.slug ?? 'partner'}-payable`, today))
}
