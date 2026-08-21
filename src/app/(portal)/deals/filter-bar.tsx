'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { cn } from '@/components/ui'
import {
  DATE_RANGES,
  DATE_RANGE_LABEL,
  DEAL_SORTS,
  DEAL_SORT_LABEL,
  type DateRange,
  type DealSort,
} from '@/lib/deals/filters'
import { DEAL_STATUSES, DEAL_STATUS_LABEL, type DealStatus } from '@/lib/types'
import type { TeamOption } from '@/lib/types'

/**
 * The filter bar.
 *
 * Filters live in the URL and the results are rendered on the server. Typing in
 * the search box debounces and then replaces the URL — one query for one page of
 * rows.
 *
 * The original called a full re-render on every keystroke, which rebuilt roughly
 * a thousand lines of markup for every screen in the app at once, then restored
 * the caret position by hand. At 500 people and a few thousand deals that was
 * hundreds of milliseconds per character.
 */
export function FilterBar({
  teams,
  showTeamFilter = true,
}: {
  teams: TeamOption[]
  showTeamFilter?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const [query, setQuery] = useState(params.get('q') ?? '')
  const firstRender = useRef(true)

  function apply(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    // Any filter change returns to the first page — staying on page 7 of a
    // result set that now has two pages is how you get a mysteriously empty table.
    next.delete('page')

    const search = next.toString()
    startTransition(() => {
      router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false })
    })
  }

  // Debounce the search box so a query fires once the typing stops.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const timer = setTimeout(() => apply({ q: query || null }), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const status = (params.get('status') ?? 'all') as DealStatus | 'all'
  const range = (params.get('range') ?? '90d') as DateRange
  const on = params.get('on') === 'closed' ? 'closed' : 'created'
  const sort = (params.get('sort') ?? 'newest') as DealSort
  const team = params.get('team') ?? ''

  return (
    <div className={cn('grid gap-3', pending && 'opacity-60')} aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="min-w-[220px] flex-1">
          <span className="sr-only">Search deals</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client, rep, city, contact…"
            className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-[14px] text-paper placeholder:text-muted/60"
          />
        </label>

        <Select
          label="Sort"
          value={sort}
          onChange={(v) => apply({ sort: v === 'newest' ? null : v })}
          options={DEAL_SORTS.map((s) => ({ value: s, label: DEAL_SORT_LABEL[s] }))}
        />

        {showTeamFilter && teams.length > 0 ? (
          <Select
            label="Pod"
            value={team}
            onChange={(v) => apply({ team: v || null })}
            options={[
              { value: '', label: 'All pods' },
              ...teams.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented
          label="Status"
          value={status}
          onChange={(v) => apply({ status: v === 'all' ? null : v })}
          options={[
            { value: 'all', label: 'All' },
            ...DEAL_STATUSES.map((s) => ({ value: s, label: DEAL_STATUS_LABEL[s] })),
          ]}
        />

        <Segmented
          label="Window"
          value={range}
          onChange={(v) => apply({ range: v === '90d' ? null : v })}
          options={DATE_RANGES.filter((r) => r !== 'custom').map((r) => ({
            value: r,
            label: DATE_RANGE_LABEL[r].replace('Last ', ''),
          }))}
        />

        {/* Which date the window applies to. The original always used the
            submission date even where the label said otherwise. */}
        {range !== 'lifetime' ? (
          <Segmented
            label="Measured on"
            value={on}
            onChange={(v) => apply({ on: v === 'created' ? null : v })}
            options={[
              { value: 'created', label: 'Submitted' },
              { value: 'closed', label: 'Closed' },
            ]}
          />
        ) : null}
      </div>
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[8px] border border-line bg-surface-2 px-2.5 py-2 text-[13.5px] text-paper"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-head text-[11px] tracking-[0.12em] text-muted uppercase">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-[7px] px-2.5 py-1 text-[12.5px]',
              o.value === value
                ? 'bg-volt font-semibold text-ink'
                : 'border border-line text-muted hover:bg-white/5 hover:text-paper',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
