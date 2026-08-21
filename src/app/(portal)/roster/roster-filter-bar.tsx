'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { cn, fmtCount } from '@/components/ui'
import {
  ROSTER_SORTS,
  ROSTER_SORT_LABEL,
  ROSTER_STATUSES,
  ROSTER_STATUS_LABEL,
  type RosterSort,
  type RosterStatus,
} from '@/lib/roster/filters'

export interface PodTab {
  value: string
  label: string
  color: string | null
  count: number
}

/**
 * The roster filter bar — same URL-driven, debounced-search pattern as the
 * deals filter bar. Pod tabs come from the server (`rosterPodCounts`) so a
 * tab's number always matches what clicking it would show, the same
 * discipline the deals page's summary line follows.
 */
export function RosterFilterBar({ pods }: { pods: PodTab[] }) {
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
    next.delete('page')

    const search = next.toString()
    startTransition(() => {
      router.replace(`${pathname}${search ? `?${search}` : ''}`, { scroll: false })
    })
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const timer = setTimeout(() => apply({ q: query || null }), 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const status = (params.get('status') ?? 'active') as RosterStatus
  const sort = (params.get('sort') ?? 'name') as RosterSort
  const team = params.get('team') ?? ''

  return (
    <div className={cn('grid gap-3', pending && 'opacity-60')} aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="min-w-[220px] flex-1">
          <span className="sr-only">Search the roster</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-[14px] text-paper placeholder:text-muted/60"
          />
        </label>

        <label className="flex items-center gap-2">
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={(e) => apply({ sort: e.target.value === 'name' ? null : e.target.value })}
            className="rounded-[8px] border border-line bg-surface-2 px-2.5 py-2 text-[13.5px] text-paper"
          >
            {ROSTER_SORTS.map((s) => (
              <option key={s} value={s}>
                {ROSTER_SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <div role="group" aria-label="Status" className="flex flex-wrap gap-1">
          {ROSTER_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === status}
              onClick={() => apply({ status: s === 'active' ? null : s })}
              className={cn(
                'rounded-[7px] px-2.5 py-1 text-[12.5px]',
                s === status
                  ? 'bg-volt font-semibold text-ink'
                  : 'border border-line text-muted hover:bg-white/5 hover:text-paper',
              )}
            >
              {ROSTER_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {pods.length > 0 ? (
        <div role="group" aria-label="Pod" className="flex flex-wrap gap-1.5">
          {pods.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={p.value === team}
              onClick={() => apply({ team: p.value || null })}
              className={cn(
                'flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1 text-[12.5px]',
                p.value === team
                  ? 'border-volt/40 bg-volt-dim text-volt'
                  : 'border-line text-muted hover:bg-white/5 hover:text-paper',
              )}
            >
              {p.color ? (
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] rounded-full"
                  style={{ backgroundColor: p.color }}
                />
              ) : null}
              {p.label}
              <span className="num text-muted">{fmtCount(p.count)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
