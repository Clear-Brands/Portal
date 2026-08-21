import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { listDeals, summariseDeals } from '@/lib/data/deals'
import { parseFilters, toSearchParams } from '@/lib/deals/filters'
import { Card, Eyebrow, Pill, SectionHeading, fmtCount, fmtMoney } from '@/components/ui'
import { Pagination } from '@/components/pagination'
import { SubmitDealForm } from './submit-form'

export const metadata = { title: 'My deals' }

/**
 * A member's own referrals.
 *
 * The list is filtered by row-level security, not by a where-clause the browser
 * could change: even a hand-crafted request returns only this person's rows.
 */
export default async function MyDealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireSession()
  const partner = await getActivePartner()
  const params = await searchParams
  const filters = { ...parseFilters(params), range: 'lifetime' as const }

  const [page, summary] = await Promise.all([listDeals(filters), summariseDeals(filters)])
  const showMoney = can(profile, 'spiffs.view') && (partner?.spiffsEnabled ?? true)

  return (
    <>
      <div className="mb-6">
        <Eyebrow>{partner?.name ?? 'Your referrals'}</Eyebrow>
        <h1 className="font-head text-[26px] leading-tight text-paper">My deals</h1>
      </div>

      <section className="mb-9">
        <SectionHeading className="mb-3">Submit a deal</SectionHeading>
        <Card className="max-w-[680px]">
          <SubmitDealForm />
        </Card>
      </section>

      <section>
        <SectionHeading className="mb-1">Your referrals</SectionHeading>
        <p className="mb-3 text-[13px] text-muted">
          <span className="num text-paper">{fmtCount(summary.count)}</span> sent ·{' '}
          <span className="num text-paper">{fmtCount(summary.closes)}</span> closed
          {showMoney ? (
            <>
              {' '}
              · <span className="num text-volt">{fmtMoney(summary.payableTotal, true)}</span> payable
            </>
          ) : null}
        </p>

        {page.rows.length === 0 ? (
          <Card>
            <p className="text-[14px] text-muted">
              No referrals yet. Send your first one in using the form above.
            </p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr>
                  {['Client', 'Status', ...(showMoney ? ['Spiff'] : []), 'Sent'].map((h, i) => (
                    <th
                      key={h}
                      className={`border-b border-line-strong px-[22px] py-3 font-head text-[11px] tracking-[0.15em] text-muted uppercase ${
                        i > 1 ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((deal) => (
                  <tr key={deal.id} className="align-top hover:bg-white/[0.025]">
                    <td className="border-b border-line px-[22px] py-3.5 text-[14px]">
                      <div className="text-paper">{deal.clientName}</div>
                      <div className="text-[12px] text-muted">{deal.service || '—'}</div>
                    </td>
                    <td className="border-b border-line px-[22px] py-3.5">
                      <Pill tone={deal.status} />
                      {deal.status === 'lost' && deal.lostReason ? (
                        <div className="mt-1 text-[11.5px] text-muted">{deal.lostReason}</div>
                      ) : null}
                    </td>
                    {showMoney ? (
                      <td className="num border-b border-line px-[22px] py-3.5 text-right text-[14px] text-paper">
                        {fmtMoney(deal.spiffAmount, true)}
                      </td>
                    ) : null}
                    <td className="num border-b border-line px-[22px] py-3.5 text-right text-[14px] text-muted">
                      {deal.createdAt.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Pagination
          page={page.page}
          perPage={page.perPage}
          total={page.total}
          pageCount={page.pageCount}
          buildHref={(patch) => `/my-deals${toSearchParams({ ...filters, ...patch })}`}
        />
      </section>
    </>
  )
}
