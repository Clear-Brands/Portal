import Link from 'next/link'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { listDeals, listTeamOptions, summariseDeals } from '@/lib/data/deals'
import { describeFilters, parseFilters, toSearchParams } from '@/lib/deals/filters'
import { Card, Eyebrow, Button, fmtCount, fmtMoney } from '@/components/ui'
import { Pagination } from '@/components/pagination'
import { FilterBar } from './filter-bar'
import { DealActions, DealStatusCell } from './deal-actions'

export const metadata = { title: 'Deals' }

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireSession()
  const partner = await getActivePartner()
  const params = await searchParams
  const filters = parseFilters(params)

  const [page, summary, teams] = await Promise.all([
    listDeals(filters),
    summariseDeals(filters),
    listTeamOptions(),
  ])

  const canWrite = can(profile, 'deals.write')
  const showMoney = can(profile, 'spiffs.view') && (partner?.spiffsEnabled ?? true)
  const teamName = teams.find((t) => t.id === filters.teamId)?.name ?? null

  const buildHref = (patch: { page?: number; perPage?: number }) =>
    `/deals${toSearchParams({ ...filters, ...patch })}`

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{partner?.name ?? 'Deals'}</Eyebrow>
          <h1 className="font-head text-[26px] leading-tight text-paper">Deals</h1>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm">
            <Link href={`/deals/pipeline`}>Pipeline view</Link>
          </Button>
          {can(profile, 'exports.run') ? (
            <Button variant="ghost" size="sm">
              <a href={`/api/export/deals${toSearchParams(filters)}`}>Export</a>
            </Button>
          ) : null}
          {canWrite ? (
            <Button size="sm">
              <Link href={'/deals/new'}>Add a deal</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="mb-4">
        <FilterBar teams={teams} />
      </Card>

      {/* The summary is aggregated over every matching deal, not the visible
          page, and it says which date the window applies to. */}
      <p className="mb-3 text-[13px] text-muted">
        {describeFilters(filters, { teamName })} —{' '}
        <span className="num text-paper">{fmtCount(summary.count)}</span>{' '}
        {summary.count === 1 ? 'deal' : 'deals'},{' '}
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
            No deals match this filter. Widen the window, clear the search, or{' '}
            {canWrite ? (
              <Link href={'/deals/new'} className="text-volt underline underline-offset-4">
                add one
              </Link>
            ) : (
              'ask Clear Brands to add one'
            )}
            .
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-2.5 sm:hidden">
            {page.rows.map((deal) => (
              <Card key={deal.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-paper">{deal.clientName}</div>
                    <div className="text-[12px] text-muted">
                      {[deal.service, [deal.city, deal.state].filter(Boolean).join(', ')]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </div>
                  </div>
                  <span className="num shrink-0 text-[12px] text-muted">{deal.ageDays}d</span>
                </div>

                {deal.promoNote ? (
                  <div className="mt-1.5 text-[12px] text-muted italic">{deal.promoNote}</div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px]">
                  <div>
                    <div className="text-paper">{deal.personName}</div>
                    {deal.teamName ? <div className="text-[12px] text-muted">{deal.teamName}</div> : null}
                  </div>
                  <DealStatusCell deal={deal} />
                </div>

                {showMoney ? (
                  <div className="mt-2 text-[13px]">
                    <span className="num text-volt">{fmtMoney(deal.spiffAmount, true)}</span>
                    {deal.partnerComp > 0 ? (
                      <span className="num ml-1.5 text-[12px] text-muted">
                        +{fmtMoney(deal.partnerComp, true)} partner
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {canWrite ? (
                  <div className="mt-3 flex justify-end border-t border-line pt-3">
                    <DealActions deal={deal} canWrite={canWrite} />
                  </div>
                ) : null}
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-x-auto p-0 sm:block">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Rep</Th>
                  <Th>Status</Th>
                  {showMoney ? <Th align="right">Spiff</Th> : null}
                  <Th align="right">Age</Th>
                  {canWrite ? <Th align="right">Actions</Th> : null}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((deal) => (
                  <tr key={deal.id} className="align-top hover:bg-white/[0.025]">
                    <Td>
                      <div className="text-paper">{deal.clientName}</div>
                      <div className="text-[12px] text-muted">
                        {[deal.service, [deal.city, deal.state].filter(Boolean).join(', ')]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                      {deal.promoNote ? (
                        <div className="mt-1 text-[12px] text-muted italic">{deal.promoNote}</div>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="text-paper">{deal.personName}</div>
                      {deal.teamName ? (
                        <div className="text-[12px] text-muted">{deal.teamName}</div>
                      ) : null}
                    </Td>
                    <Td>
                      <DealStatusCell deal={deal} />
                    </Td>
                    {showMoney ? (
                      <Td align="right">
                        <span className="num text-paper">{fmtMoney(deal.spiffAmount, true)}</span>
                        {deal.partnerComp > 0 ? (
                          <div className="num text-[12px] text-muted">
                            +{fmtMoney(deal.partnerComp, true)} partner
                          </div>
                        ) : null}
                      </Td>
                    ) : null}
                    <Td align="right">
                      <span className="num text-muted">{deal.ageDays}d</span>
                    </Td>
                    {canWrite ? (
                      <Td align="right">
                        <DealActions deal={deal} canWrite={canWrite} />
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Pagination
        page={page.page}
        perPage={page.perPage}
        total={page.total}
        pageCount={page.pageCount}
        buildHref={buildHref}
      />
    </>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={`border-b border-line-strong px-[22px] py-3 font-head text-[11px] tracking-[0.15em] text-muted uppercase ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <td
      className={`border-b border-line px-[22px] py-3.5 text-[14px] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </td>
  )
}
