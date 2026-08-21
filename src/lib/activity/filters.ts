/**
 * Activity log filters, as a pure module — same shape as the deals and roster
 * filter modules. Filters live in the URL so a filtered view is shareable and
 * survives a refresh.
 */

export const ACTIVITY_KINDS = ['all', 'deal', 'money', 'team', 'program', 'access'] as const
export type ActivityKindFilter = (typeof ACTIVITY_KINDS)[number]

export const ACTIVITY_KIND_LABEL: Record<ActivityKindFilter, string> = {
  all: 'Everything',
  deal: 'Deals',
  money: 'Money',
  team: 'Roster',
  program: 'Programs',
  access: 'Access',
}

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const

export interface ActivityFilters {
  q: string
  kind: ActivityKindFilter
  page: number
  perPage: number
}

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = {
  q: '',
  kind: 'all',
  page: 1,
  perPage: 25,
}

type ParamsLike = Record<string, string | string[] | undefined>

function one(params: ParamsLike, key: string): string | undefined {
  const value = params[key]
  return Array.isArray(value) ? value[0] : value
}

export function parseActivityFilters(params: ParamsLike): ActivityFilters {
  const kind = one(params, 'kind')
  const page = Number.parseInt(one(params, 'page') ?? '', 10)
  const perPage = Number.parseInt(one(params, 'per') ?? '', 10)

  return {
    q: (one(params, 'q') ?? '').trim().slice(0, 120),
    kind: (ACTIVITY_KINDS as readonly string[]).includes(kind ?? '')
      ? (kind as ActivityKindFilter)
      : DEFAULT_ACTIVITY_FILTERS.kind,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    perPage: (PER_PAGE_OPTIONS as readonly number[]).includes(perPage)
      ? perPage
      : DEFAULT_ACTIVITY_FILTERS.perPage,
  }
}

export function toActivitySearchParams(filters: Partial<ActivityFilters>): string {
  const merged = { ...DEFAULT_ACTIVITY_FILTERS, ...filters }
  const params = new URLSearchParams()

  if (merged.q) params.set('q', merged.q)
  if (merged.kind !== DEFAULT_ACTIVITY_FILTERS.kind) params.set('kind', merged.kind)
  if (merged.page > 1) params.set('page', String(merged.page))
  if (merged.perPage !== DEFAULT_ACTIVITY_FILTERS.perPage) params.set('per', String(merged.perPage))

  const query = params.toString()
  return query ? `?${query}` : ''
}
