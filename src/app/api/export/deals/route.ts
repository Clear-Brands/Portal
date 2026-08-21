import type { NextRequest } from 'next/server'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner, partnerToday } from '@/lib/partner-context'
import { listDeals } from '@/lib/data/deals'
import { describeFilters, parseFilters } from '@/lib/deals/filters'
import { buildWorkbook, exportFilename, xlsxResponse } from '@/lib/exports/workbook'

/**
 * Exports whatever the current filters show — status, pod, window, search, all
 * respected — because it reuses the same filter parsing the page does.
 */
export async function GET(request: NextRequest) {
  const profile = await requireSession()
  if (!can(profile, 'exports.run')) {
    return new Response('Not permitted', { status: 403 })
  }

  const partner = await getActivePartner()
  const today = await partnerToday()
  const filters = parseFilters(Object.fromEntries(request.nextUrl.searchParams))

  // Exports are not paged, but they are still bounded: an unbounded export is
  // how you turn a click into a thirty-second request.
  const page = await listDeals({ ...filters, page: 1, perPage: 5000 })
  const showMoney = can(profile, 'spiffs.view')

  const buffer = await buildWorkbook([
    {
      name: 'Deals',
      title: `${partner?.name ?? 'Deals'} — deals`,
      subtitle: `${describeFilters(filters)} · exported ${today}`,
      columns: [
        { header: 'Client', key: 'client', width: 28 },
        { header: 'Service', key: 'service' },
        { header: 'Rep', key: 'person', width: 22 },
        { header: 'Pod', key: 'team', width: 18 },
        { header: 'Status', key: 'status' },
        { header: 'City', key: 'city' },
        { header: 'State', key: 'state', width: 8 },
        { header: 'Contact', key: 'contact', width: 20 },
        { header: 'Phone', key: 'phone', width: 16 },
        { header: 'Email', key: 'email', width: 24 },
        { header: 'Submitted', key: 'created', width: 14 },
        { header: 'Closed', key: 'closed', width: 14 },
        ...(showMoney ? [{ header: 'Spiff', key: 'spiff', money: true }] : []),
        ...(showMoney ? [{ header: 'Partner cut', key: 'comp', money: true }] : []),
        { header: 'Note', key: 'note', width: 30 },
        { header: 'Lost reason', key: 'lostReason', width: 30 },
      ],
      rows: page.rows.map((d) => ({
        client: d.clientName,
        service: d.service,
        person: d.personName,
        team: d.teamName ?? '',
        status:
          d.status === 'closed' ? 'Payable' : d.status.charAt(0).toUpperCase() + d.status.slice(1),
        city: d.city,
        state: d.state,
        contact: d.contact,
        phone: d.phone,
        email: d.email,
        created: d.createdAt.slice(0, 10),
        closed: d.closedAt ?? '',
        spiff: d.spiffAmount,
        comp: d.partnerComp,
        note: d.promoNote,
        lostReason: d.lostReason,
      })),
      totals: showMoney
        ? {
            client: `${page.rows.length} deals`,
            spiff: page.rows.reduce((n, d) => n + d.spiffAmount, 0),
            comp: page.rows.reduce((n, d) => n + d.partnerComp, 0),
          }
        : { client: `${page.rows.length} deals` },
    },
  ])

  return xlsxResponse(buffer, exportFilename(`${partner?.slug ?? 'deals'}-deals`, today))
}
