import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner, partnerToday } from '@/lib/partner-context'
import { listPayouts } from '@/lib/data/payouts'
import { buildWorkbook, exportFilename, xlsxResponse } from '@/lib/exports/workbook'

/** The whole transfer ledger, voided batches included and clearly marked. */
export async function GET() {
  const profile = await requireSession()
  if (!can(profile, 'exports.run')) return new Response('Not permitted', { status: 403 })

  const partner = await getActivePartner()
  const today = await partnerToday()
  const payouts = await listPayouts(240)

  const live = payouts.filter((p) => !p.voidedAt)

  const buffer = await buildWorkbook([
    {
      name: 'Transfers',
      title: `${partner?.name ?? 'Partner'} — every transfer`,
      subtitle: `Exported ${today}. Voided batches are listed and excluded from the total.`,
      columns: [
        { header: 'Paid', key: 'paid', width: 14 },
        { header: 'Month', key: 'period', width: 12 },
        { header: 'Reference', key: 'reference', width: 22 },
        { header: 'To reps', key: 'spiff', money: true },
        { header: 'To partner', key: 'comp', money: true },
        { header: 'Total', key: 'total', money: true },
        { header: 'Status', key: 'status', width: 30 },
      ],
      rows: payouts.map((p) => ({
        paid: p.paidDate,
        period: p.period,
        reference: p.reference,
        spiff: p.spiffTotal,
        comp: p.compTotal,
        total: p.total,
        status: p.voidedAt ? `Voided — ${p.voidReason}` : 'Recorded',
      })),
      totals: {
        paid: `${live.length} live batches`,
        spiff: live.reduce((n, p) => n + p.spiffTotal, 0),
        comp: live.reduce((n, p) => n + p.compTotal, 0),
        total: live.reduce((n, p) => n + p.total, 0),
      },
    },
  ])

  return xlsxResponse(buffer, exportFilename(`${partner?.slug ?? 'partner'}-transfers`, today))
}
