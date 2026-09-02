import Link from 'next/link'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { listRoster, rosterPodCounts } from '@/lib/data/roster'
import { parseRosterFilters, toRosterSearchParams } from '@/lib/roster/filters'
import { Card, Eyebrow, Button, Pill, fmtCount, fmtMoney } from '@/components/ui'
import { Pagination } from '@/components/pagination'
import { RosterFilterBar, type PodTab } from './roster-filter-bar'
import { PersonRowActions } from './person-row-actions'
import { AddPersonButton } from './add-person-button'

export const metadata = { title: 'Roster' }

export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireSession()
  const partner = await getActivePartner()
  const params = await searchParams
  const filters = parseRosterFilters(params)

  const [page, podCounts] = await Promise.all([
    listRoster(filters),
    rosterPodCounts({ q: filters.q, status: filters.status }),
  ])

  const canWrite = can(profile, 'people.write')
  const showMoney = can(profile, 'spiffs.view') && (partner?.spiffsEnabled ?? true)
  const canManagePerms =
    (profile.role === 'internal' && profile.access === 'admin') || profile.role === 'partner_admin'
  // Promoting a rep-level login to partner admin is internal-only — RLS
  // itself refuses this from a partner admin's session, see the comment on
  // promoteToPartnerAdmin in src/lib/actions/roster.ts.
  const canPromote = profile.role === 'internal' && canWrite

  const pods: PodTab[] = [
    { value: '', label: 'All pods', color: null, count: podCounts.all },
    ...podCounts.teams.map((t) => ({ value: t.id, label: t.name, color: t.color, count: t.count })),
    { value: 'none', label: 'No pod', color: null, count: podCounts.noPod },
  ]

  const buildHref = (patch: { page?: number; perPage?: number }) =>
    `/roster${toRosterSearchParams({ ...filters, ...patch })}`

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{partner?.name ?? 'Roster'}</Eyebrow>
          <h1 className="font-head text-[26px] leading-tight text-paper">Roster</h1>
        </div>

        {canWrite ? (
          <div className="flex gap-2">
            <AddPersonButton teams={podCounts.teams} canAddManager={profile.role === 'internal'} />
            <Button size="sm">
              <Link href="/roster/import">Import CSV</Link>
            </Button>
          </div>
        ) : null}
      </div>

      <Card className="mb-4">
        <RosterFilterBar pods={pods} />
      </Card>

      <p className="mb-3 text-[13px] text-muted">
        <span className="num text-paper">{fmtCount(page.total)}</span>{' '}
        {page.total === 1 ? 'person' : 'people'}
      </p>

      {page.rows.length === 0 ? (
        <Card>
          <p className="text-[14px] text-muted">
            No one matches this filter. Widen the search, or{' '}
            {canWrite ? (
              <Link href="/roster/import" className="text-volt underline underline-offset-4">
                import a CSV
              </Link>
            ) : (
              'ask Clear Brands to add someone'
            )}
            .
          </p>
        </Card>
      ) : (
        <>
          {/* Below sm, a table this wide is unreadable no matter how it scrolls — cards instead. */}
          <div className="grid gap-2.5 sm:hidden">
            {page.rows.map((person) => (
              <Card key={person.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-paper">{person.name}</div>
                    <div className="truncate text-[12px] text-muted">
                      {person.title ? `${person.title} · ` : ''}
                      {person.email}
                    </div>
                  </div>
                  <Pill tone={person.active ? 'neutral' : 'lost'}>
                    {person.active ? 'Active' : 'Inactive'}
                  </Pill>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
                  {person.teamName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-[7px] w-[7px] rounded-full"
                        style={{ backgroundColor: person.teamColor }}
                      />
                      {person.teamName}
                      {person.kind === 'manager' ? ' · Manager' : ''}
                    </span>
                  ) : (
                    <span>No pod{person.kind === 'manager' ? ' · Manager' : ''}</span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[13px]">
                  <div>
                    <div className="text-[11px] text-muted uppercase">Sent</div>
                    <span className="num text-paper">{fmtCount(person.dealsSent)}</span>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted uppercase">Closes</div>
                    <span className="num text-paper">{fmtCount(person.closes)}</span>
                    {person.openDeals > 0 ? (
                      <div className="num text-[11px] text-muted">{person.openDeals} open</div>
                    ) : null}
                  </div>
                  {showMoney ? (
                    <div>
                      <div className="text-[11px] text-muted uppercase">Spiff</div>
                      <span className="num text-volt">{fmtMoney(person.spiffPayable, true)}</span>
                    </div>
                  ) : null}
                </div>

                {canWrite ? (
                  <div className="mt-3 flex justify-end border-t border-line pt-3">
                    <PersonRowActions
                      person={person}
                      teams={podCounts.teams}
                      canWrite={canWrite}
                      canManagePerms={canManagePerms}
                      canPromote={canPromote}
                    />
                  </div>
                ) : null}
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-x-auto p-0 sm:block">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Pod</Th>
                  <Th align="right">Sent</Th>
                  <Th align="right">Closes</Th>
                  {showMoney ? <Th align="right">Spiff</Th> : null}
                  <Th>Status</Th>
                  {canWrite ? <Th align="right">Actions</Th> : null}
                </tr>
              </thead>
              <tbody>
                {page.rows.map((person) => (
                  <tr key={person.id} className="align-top hover:bg-white/[0.025]">
                    <Td>
                      <div className="text-paper">{person.name}</div>
                      <div className="text-[12px] text-muted">
                        {person.title ? `${person.title} · ` : ''}
                        {person.email}
                      </div>
                    </Td>
                    <Td>
                      {person.teamName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="h-[7px] w-[7px] rounded-full"
                            style={{ backgroundColor: person.teamColor }}
                          />
                          {person.teamName}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      {person.kind === 'manager' ? (
                        <div className="mt-1 text-[11.5px] text-muted uppercase">Manager</div>
                      ) : null}
                    </Td>
                    <Td align="right">
                      <span className="num text-paper">{fmtCount(person.dealsSent)}</span>
                    </Td>
                    <Td align="right">
                      <span className="num text-paper">{fmtCount(person.closes)}</span>
                      {person.openDeals > 0 ? (
                        <div className="num text-[12px] text-muted">{person.openDeals} open</div>
                      ) : null}
                    </Td>
                    {showMoney ? (
                      <Td align="right">
                        <span className="num text-volt">{fmtMoney(person.spiffPayable, true)}</span>
                        {person.spiffEarned !== person.spiffPayable ? (
                          <div className="num text-[12px] text-muted">
                            {fmtMoney(person.spiffEarned, true)} earned
                          </div>
                        ) : null}
                      </Td>
                    ) : null}
                    <Td>
                      <Pill tone={person.active ? 'neutral' : 'lost'}>
                        {person.active ? 'Active' : 'Inactive'}
                      </Pill>
                    </Td>
                    {canWrite ? (
                      <Td align="right">
                        <PersonRowActions
                          person={person}
                          teams={podCounts.teams}
                          canWrite={canWrite}
                          canManagePerms={canManagePerms}
                          canPromote={canPromote}
                        />
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
