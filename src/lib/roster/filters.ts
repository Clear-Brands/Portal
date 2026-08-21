/**
 * Roster filters, as a pure module — same shape as src/lib/deals/filters.ts.
 * Filters live in the URL so a filtered roster view is shareable and survives
 * a refresh, and the whole state is a plain object with no database involved.
 */

export const ROSTER_STATUSES = ['all', 'active', 'inactive'] as const
export type RosterStatus = (typeof ROSTER_STATUSES)[number]

export const ROSTER_STATUS_LABEL: Record<RosterStatus, string> = {
  all: 'All',
  active: 'Active',
  inactive: 'Inactive',
}

export const ROSTER_SORTS = ['name', 'sent', 'closes', 'spiffs'] as const
export type RosterSort = (typeof ROSTER_SORTS)[number]

export const ROSTER_SORT_LABEL: Record<RosterSort, string> = {
  name: 'Name A–Z',
  sent: 'Most sent',
  closes: 'Most closes',
  spiffs: 'Highest spiffs',
}

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

export interface RosterFilters {
  q: string
  teamId: string | null
  status: RosterStatus
  sort: RosterSort
  page: number
  perPage: number
}

export const DEFAULT_ROSTER_FILTERS: RosterFilters = {
  q: '',
  teamId: null,
  status: 'active',
  sort: 'name',
  page: 1,
  perPage: 25,
}

type ParamsLike = Record<string, string | string[] | undefined>

function one(params: ParamsLike, key: string): string | undefined {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

export function parseRosterFilters(params: ParamsLike): RosterFilters {
  const status = one(params, 'status')
  const sort = one(params, 'sort')
  const page = Number.parseInt(one(params, 'page') ?? '', 10)
  const perPage = Number.parseInt(one(params, 'per') ?? '', 10)

  return {
    q: (one(params, 'q') ?? '').trim().slice(0, 120),
    teamId: one(params, 'team') || null,
    status: (ROSTER_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as RosterStatus)
      : DEFAULT_ROSTER_FILTERS.status,
    sort: (ROSTER_SORTS as readonly string[]).includes(sort ?? '')
      ? (sort as RosterSort)
      : DEFAULT_ROSTER_FILTERS.sort,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
      ? perPage
      : DEFAULT_ROSTER_FILTERS.perPage,
  }
}

export function toRosterSearchParams(filters: Partial<RosterFilters>): string {
  const merged = { ...DEFAULT_ROSTER_FILTERS, ...filters }
  const params = new URLSearchParams()

  if (merged.q) params.set('q', merged.q)
  if (merged.teamId) params.set('team', merged.teamId)
  if (merged.status !== DEFAULT_ROSTER_FILTERS.status) params.set('status', merged.status)
  if (merged.sort !== DEFAULT_ROSTER_FILTERS.sort) params.set('sort', merged.sort)
  if (merged.page > 1) params.set('page', String(merged.page))
  if (merged.perPage !== DEFAULT_ROSTER_FILTERS.perPage) params.set('per', String(merged.perPage))

  const query = params.toString()
  return query ? `?${query}` : ''
}
