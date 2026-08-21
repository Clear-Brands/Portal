'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { cn } from '@/components/ui'
import { ACTIVITY_KINDS, ACTIVITY_KIND_LABEL, type ActivityKindFilter } from '@/lib/activity/filters'

export function ActivityFilterBar() {
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

  const kind = (params.get('kind') ?? 'all') as ActivityKindFilter

  return (
    <div className={cn('flex flex-wrap items-center gap-3', pending && 'opacity-60')} aria-busy={pending}>
      <label className="min-w-[220px] flex-1">
        <span className="sr-only">Search activity</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the log…"
          className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2 text-[14px] text-paper placeholder:text-muted/60"
        />
      </label>

      <div role="group" aria-label="Kind" className="flex flex-wrap gap-1">
        {ACTIVITY_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => apply({ kind: k === 'all' ? null : k })}
            className={cn(
              'rounded-[7px] px-2.5 py-1 text-[12.5px]',
              k === kind
                ? 'bg-volt font-semibold text-ink'
                : 'border border-line text-muted hover:bg-white/5 hover:text-paper',
            )}
          >
            {ACTIVITY_KIND_LABEL[k]}
          </button>
        ))}
      </div>
    </div>
  )
}
