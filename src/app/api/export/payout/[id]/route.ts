import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner, partnerToday } from '@/lib/partner-context'
import { getPayout } from '@/lib/data/payouts'
import { buildWorkbook, exportFilename, xlsxResponse } from '@/lib/exports/workbook'

/**
 * One recorded transfer, itemised.
 *
 * This works for a voided batch too, because voiding never unlinks the line
 * items. In the original it could not: voiding nulled the link between the deals
 * and the batch, so an export of a voided transfer had nothing to show.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireSession()
  if (!can(profile, 'exports.run')) return new Response('Not permitted', { status: 403 })

  const { id } = await params
  const payout = await getPayout(id)
  if (!payout) return new Response('Not found', { status: 404 })

  const partner = await getActivePartner()
  const today = await partnerToday()

  const buffer = await buildWorkbook([
    {
      name: 'Distribution',
      title: `${partner?.name ?? 'Partner'} — transfer ${payout.reference}`,
      subtitle: [
        `Paid ${payout.paidDate}`,
        payout.voidedAt ? `VOIDED — ${payout.voidReason}` : null,
        `Exported ${today}`,
      ]
        .filter(Boolean)
        .join(' · '),
      columns: [
        { header: 'Person', key: 'person', width: 26 },
        { header: 'Pod', key: 'team', width: 20 },
        { header: 'Amount', key: 'amount', money: true },
      ],
      rows: payout.perPerson.map((p) => ({
        person: p.personName,
        team: p.teamName,
        amount: p.amount,
      })),
      totals: { person: 'TOTAL', amount: payout.total },
    },
    {
      name: 'Deal by deal',
      columns: [
        { header: 'Client', key: 'client', width: 28 },
        { header: 'Person', key: 'person', width: 24 },
        { header: 'Pod', key: 'team', width: 18 },
        { header: 'Kind', key: 'kind', width: 12 },
        { header: 'Amount', key: 'amount', money: true },
      ],
      rows: payout.lines.map((l) => ({
        client: l.clientName,
        person: l.personName,
        team: l.teamName,
        kind: l.kind === 'company' ? 'Partner cut' : 'Rep spiff',
        amount: l.amount,
      })),
      totals: { client: 'TOTAL', amount: payout.total },
    },
  ])

  return xlsxResponse(buffer, exportFilename(`transfer-${payout.reference}`, today))
}
