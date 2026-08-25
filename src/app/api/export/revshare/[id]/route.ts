import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner, partnerToday } from '@/lib/partner-context'
import { getRevshareStatement } from '@/lib/data/revshare'
import { buildWorkbook, exportFilename, xlsxResponse } from '@/lib/exports/workbook'

/**
 * One monthly rev-share statement, itemised — the downloadable statement a
 * partner needs, same pattern as /api/export/payout/[id]. Works for a voided
 * statement too, since voiding never unlinks its line items.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireSession()
  if (!can(profile, 'exports.run')) return new Response('Not permitted', { status: 403 })

  const { id } = await params
  const statement = await getRevshareStatement(id)
  if (!statement) return new Response('Not found', { status: 404 })

  const partner = await getActivePartner()
  const today = await partnerToday()

  const buffer = await buildWorkbook([
    {
      name: 'Statement',
      title: `${partner?.name ?? 'Partner'} — rev share ${statement.period}`,
      subtitle: [
        `${statement.pct}% of $${statement.base.toFixed(2)} accruing monthly base`,
        statement.voidedAt ? `VOIDED — ${statement.voidReason}` : null,
        `ref ${statement.reference}`,
        `Exported ${today}`,
      ]
        .filter(Boolean)
        .join(' · '),
      columns: [
        { header: 'Client', key: 'client', width: 28 },
        { header: 'Monthly value', key: 'monthlyValue', money: true },
        { header: 'Share', key: 'share', money: true },
      ],
      rows: statement.lines.map((l) => ({
        client: l.clientName,
        monthlyValue: l.monthlyValue,
        share: l.share,
      })),
      totals: { client: 'TOTAL', share: statement.total },
    },
  ])

  return xlsxResponse(buffer, exportFilename(`${partner?.slug ?? 'partner'}-revshare-${statement.period}`, today))
}
