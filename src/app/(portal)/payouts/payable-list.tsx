'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { fmtMoney } from '@/components/ui'

interface BatchPersonDeal {
  dealId: string | null
  clientName: string
  spiffAmount: number
  closedAt: string
}

interface PersonRollup {
  personId: string
  personName: string
  teamName: string | null
  amount: number
  deals: number
  lines: BatchPersonDeal[]
}

type Sort = 'amount_desc' | 'name' | 'deals_desc'

const SORT_LABEL: Record<Sort, string> = {
  amount_desc: 'Highest amount',
  name: 'Name',
  deals_desc: 'Most deals',
}

const DEFAULT_VISIBLE = 6

/**
 * The payable batch's per-person breakdown, with a search box and a sort —
 * same treatment as the Rev share account list, for the same reason.
 * Cristian on the Loom walkthrough, after asking for search on Rev share:
 * "The same thing over here" — pointing at this exact list on Payouts.
 */
export function PayableList({ perPerson }: { perPerson: PersonRollup[] }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('amount_desc')
  const [expanded, setExpanded] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matching = q
      ? perPerson.filter(
          (p) =>
            p.personName.toLowerCase().includes(q) ||
            (p.teamName ?? '').toLowerCase().includes(q) ||
            p.lines.some((l) => l.clientName.toLowerCase().includes(q)),
        )
      : perPerson

    return [...matching].sort((a, b) => {
      if (sort === 'name') return a.personName.localeCompare(b.personName)
      if (sort === 'deals_desc') return b.deals - a.deals
      return b.amount - a.amount
    })
  }, [perPerson, query, sort])

  if (perPerson.length === 0) return null

  const visible = expanded || query ? filtered : filtered.slice(0, DEFAULT_VISIBLE)
  const hiddenCount = filtered.length - visible.length

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <label className="min-w-[200px] flex-1">
          <span className="sr-only">Search people or deals</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rep, pod, client…"
            className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-1.5 text-[13.5px] text-paper placeholder:text-muted/60"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-[8px] border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-paper"
          >
            {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13.5px] text-muted">No one matches &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <li key={p.personId} className="text-[13px]">
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-2.5 text-paper marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex-1 truncate">{p.personName}</span>
                  <span className="num text-muted">{fmtMoney(p.amount, true)}</span>
                </summary>
                <DealDrilldown deals={p.lines} />
              </details>
            </li>
          ))}
        </ul>
      )}

      {!query && hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-[13px] text-muted hover:text-paper"
        >
          +{hiddenCount} more — view everyone
        </button>
      ) : null}
    </div>
  )
}

function DealDrilldown({ deals }: { deals: BatchPersonDeal[] }) {
  if (deals.length === 0) return null
  return (
    <ul className="mt-1.5 ml-4 grid gap-1 border-l border-line pl-3">
      {deals.map((d, i) => (
        <li key={d.dealId ?? i} className="flex items-center gap-2 text-[12px] text-muted">
          {d.dealId ? (
            <Link href={`/deals/${d.dealId}`} className="flex-1 truncate hover:text-paper hover:underline">
              {d.clientName}
            </Link>
          ) : (
            <span className="flex-1 truncate">{d.clientName}</span>
          )}
          <span className="num text-paper">{fmtMoney(d.spiffAmount, true)}</span>
        </li>
      ))}
    </ul>
  )
}
