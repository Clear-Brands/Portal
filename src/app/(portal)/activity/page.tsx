import Link from 'next/link'

import { can } from '@/lib/auth/capabilities'
import { requireSession } from '@/lib/session'
import { getActivePartner } from '@/lib/partner-context'
import { listActivity } from '@/lib/data/activity'
import { DEFAULT_ACTIVITY_FILTERS, parseActivityFilters, toActivitySearchParams } from '@/lib/activity/filters'
import { Card, Eyebrow, Pill, fmtCount, fmtDateTime } from '@/components/ui'
import { Pagination } from '@/components/pagination'
import { ActivityFilterBar } from './activity-filter-bar'
import type { ActivityKind } from '@/lib/data/activity'

export const metadata = { title: 'Activity' }

const KIND_LABEL: Record<ActivityKind, string> = {
  deal: 'Deal',
  money: 'Money',
  team: 'Roster',
  program: 'Program',
  access: 'Access',
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const profile = await requireSession()
  if (!can(profile, 'activity.view')) {
    return (
      <Card>
        <p className="text-[14px] text-muted">You do not have permission to see the activity log.</p>
      </Card>
    )
  }

  const partner = await getActivePartner()
  const params = await searchParams
  const filters = parseActivityFilters(params)
  const page = await listActivity(filters)

  const buildHref = (patch: { page?: number; perPage?: number }) =>
    `/activity${toActivitySearchParams({ ...filters, ...patch })}`

  return (
    <>
      <div className="mb-6">
        <Eyebrow>{partner?.name ?? 'Activity'}</Eyebrow>
        <h1 className="font-head text-[26px] leading-tight text-paper">Activity</h1>
        <p className="mt-1.5 max-w-[62ch] text-[13.5px] text-muted">
          Append-only — every line here is something that actually happened. A failed save never
          shows up.
        </p>
      </div>

      <Card className="mb-4">
        <ActivityFilterBar />
      </Card>

      <p className="mb-3 text-[13px] text-muted">
        <span className="num text-paper">{fmtCount(page.total)}</span>{' '}
        {page.total === 1 ? 'entry' : 'entries'}
      </p>

      {page.rows.length === 0 ? (
        <Card>
          <p className="text-[14px] text-muted">
            {filters.q === DEFAULT_ACTIVITY_FILTERS.q && filters.kind === DEFAULT_ACTIVITY_FILTERS.kind ? (
              'Nothing logged yet. This fills up as deals, payouts and roster changes happen.'
            ) : (
              <>
                Nothing matches this filter.{' '}
                <Link href="/activity" className="text-volt underline underline-offset-4">
                  Clear it
                </Link>
                {' '}to see everything.
              </>
            )}
          </p>
        </Card>
      ) : (
        <div className="grid gap-1.5">
          {page.rows.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-start gap-3 rounded-[8px] border border-line bg-surface-2 px-3.5 py-2.5 text-[13.5px]"
            >
              <Pill tone="neutral">{KIND_LABEL[entry.kind]}</Pill>
              <span className="flex-1 text-paper">{entry.text}</span>
              <span className="text-[12px] text-muted">{entry.actorName}</span>
              <time dateTime={entry.createdAt} className="num w-[128px] text-right text-[12px] text-muted">
                {fmtDateTime(entry.createdAt)}
              </time>
            </div>
          ))}
        </div>
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
