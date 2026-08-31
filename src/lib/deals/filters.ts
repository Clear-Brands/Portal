/**
 * Deal filters, as a pure module.
 *
 * Filters live in the URL, which means a filtered view is shareable, survives a
 * refresh, and lets the browser's back button work. It also means the whole
 * filter state is a plain object that can be unit-tested without a database or
 * a browser — see src/lib/deals/filters.test.ts.
 *
 * One behavioural correction: the original's date filter always ran against the
 * submission date, even on screens whose headline said "closed in this window".
 * The basis is explicit here (`on=created` or `on=closed`) and the summary line
 * says which one is in play.
 */

import { DEAL_STATUSES, type DealStatus } from '@/lib/types'

export const DATE_RANGES = ['7d', '30d', '90d', '12m', 'lifetime', 'custom'] as const
export type DateRange = (typeof DATE_RANGES)[number]

export const DATE_RANGE_LABEL: Record<DateRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '12m': 'Last 12 months',
  lifetime: 'All time',
  custom: 'Custom range',
}

export const DEAL_SORTS = [
  'newest',
  'oldest',
  'client',
  'person',
  'spiff_high',
  'spiff_low',
  'longest',
  'closed',
] as const
export type DealSort = (typeof DEAL_SORTS)[number]

export const DEAL_SORT_LABEL: Record<DealSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  client: 'Client A–Z',
  person: 'Rep A–Z',
  spiff_high: 'Spiff, high to low',
  spiff_low: 'Spiff, low to high',
  longest: 'Open longest',
  closed: 'Recently closed',
}

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

export interface DealFilters {
  q: string
  status: DealStatus | 'all'
  teamId: string | null
  personId: string | null
  range: DateRange
  /** Which date the range applies to. */
  on: 'created' | 'closed'
  from: string | null
  to: string | null
  sort: DealSort
  page: number
  perPage: number
  /**
   * Churn is not a deal status — a churned account can sit in any status
   * (almost always 'paid') with churned_at stamped once `live` flips false
   * (0026). So this is its own on/off filter rather than another value of
   * `status`, and it composes with status the same way team/person do —
   * except the filter bar's Status control treats "Churned" as mutually
   * exclusive with a specific status, since asking for both at once ("Paid
   * AND churned") is a much narrower question than what "Churned" means on
   * its own here.
   */
  churned: boolean
}

export const DEFAULT_FILTERS: DealFilters = {
  q: '',
  status: 'all',
  teamId: null,
  personId: null,
  range: '90d',
  on: 'created',
  from: null,
  to: null,
  sort: 'newest',
  page: 1,
  perPage: 25,
  churned: false,
}

type ParamsLike = Record<string, string | string[] | undefined>

function one(params: ParamsLike, key: string): string | undefined {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Read filters out of a URL's search params, falling back to the defaults. */
export function parseFilters(params: ParamsLike): DealFilters {
  const status = one(params, 'status')
  const range = one(params, 'range')
  const sort = one(params, 'sort')
  const on = one(params, 'on')
  const from = one(params, 'from')
  const to = one(params, 'to')

  const page = Number.parseInt(one(params, 'page') ?? '', 10)
  const perPage = Number.parseInt(one(params, 'per') ?? '', 10)

  return {
    q: (one(params, 'q') ?? '').trim().slice(0, 120),
    status:
      status && (DEAL_STATUSES as readonly string[]).includes(status)
        ? (status as DealStatus)
        : 'all',
    teamId: one(params, 'team') || null,
    personId: one(params, 'person') || null,
    range: (DATE_RANGES as readonly string[]).includes(range ?? '')
      ? (range as DateRange)
      : DEFAULT_FILTERS.range,
    on: on === 'closed' ? 'closed' : 'created',
    from: from && ISO_DATE.test(from) ? from : null,
    to: to && ISO_DATE.test(to) ? to : null,
    sort: (DEAL_SORTS as readonly string[]).includes(sort ?? '')
      ? (sort as DealSort)
      : DEFAULT_FILTERS.sort,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
      ? perPage
      : DEFAULT_FILTERS.perPage,
    churned: one(params, 'churned') === '1',
  }
}

/**
 * Serialise back to a query string, omitting anything at its default so URLs
 * stay short and a "no filters" view is a clean path.
 */
export function toSearchParams(filters: Partial<DealFilters>): string {
  const merged = { ...DEFAULT_FILTERS, ...filters }
  const params = new URLSearchParams()

  if (merged.q) params.set('q', merged.q)
  if (merged.status !== 'all') params.set('status', merged.status)
  if (merged.teamId) params.set('team', merged.teamId)
  if (merged.personId) params.set('person', merged.personId)
  if (merged.range !== DEFAULT_FILTERS.range) params.set('range', merged.range)
  if (merged.on !== DEFAULT_FILTERS.on) params.set('on', merged.on)
  if (merged.range === 'custom') {
    if (merged.from) params.set('from', merged.from)
    if (merged.to) params.set('to', merged.to)
  }
  if (merged.sort !== DEFAULT_FILTERS.sort) params.set('sort', merged.sort)
  if (merged.page > 1) params.set('page', String(merged.page))
  if (merged.perPage !== DEFAULT_FILTERS.perPage) params.set('per', String(merged.perPage))
  if (merged.churned) params.set('churned', '1')

  const query = params.toString()
  return query ? `?${query}` : ''
}

/**
 * Resolve a range into concrete dates.
 *
 * `today` is passed in rather than read from the clock so this stays pure and
 * the caller can supply the partner's own date. The original computed "today" in
 * UTC and compared it in local time, which shifted every window by a day for
 * anyone west of London after early evening.
 */
export function resolveWindow(
  filters: DealFilters,
  today: string,
): { from: string | null; to: string | null } {
  if (filters.range === 'lifetime') return { from: null, to: null }

  if (filters.range === 'custom') {
    return { from: filters.from, to: filters.to }
  }

  const days: Record<Exclude<DateRange, 'lifetime' | 'custom'>, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '12m': 365,
  }

  const end = new Date(`${today}T00:00:00Z`)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days[filters.range])

  return { from: start.toISOString().slice(0, 10), to: today }
}

/** How the current filters read in a sentence, for the summary line. */
export function describeFilters(
  filters: DealFilters,
  context: { teamName?: string | null; personName?: string | null } = {},
): string {
  const parts: string[] = []

  parts.push(
    filters.churned
      ? 'Churned deals'
      : filters.status === 'all'
        ? 'All deals'
        : `${filters.status === 'closed' ? 'Payable' : filters.status.replace('_', ' ')} deals`,
  )

  if (context.personName) parts.push(`from ${context.personName}`)
  else if (context.teamName) parts.push(`in ${context.teamName}`)

  if (filters.range !== 'lifetime') {
    const basis = filters.on === 'closed' ? 'closed' : 'submitted'
    parts.push(
      filters.range === 'custom' && filters.from
        ? `${basis} between ${filters.from} and ${filters.to ?? 'today'}`
        : `${basis} in the ${DATE_RANGE_LABEL[filters.range].toLowerCase().replace('last ', 'last ')}`,
    )
  }

  if (filters.q) parts.push(`matching “${filters.q}”`)

  return parts.join(' ')
}

/** True when anything is narrowing the view, so the UI can offer "clear". */
export function hasActiveFilters(filters: DealFilters): boolean {
  return (
    filters.q !== '' ||
    filters.status !== 'all' ||
    filters.teamId !== null ||
    filters.personId !== null ||
    filters.range !== DEFAULT_FILTERS.range ||
    filters.on !== DEFAULT_FILTERS.on ||
    filters.churned !== DEFAULT_FILTERS.churned
  )
}
