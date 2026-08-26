'use client'

import { useMemo, useState } from 'react'

import { Pill, fmtMoney } from '@/components/ui'
import type { LiveAccount } from '@/lib/data/revshare'
import { EditMonthlyValueButton, MarkChurnedButton, MarkLiveButton } from './revshare-controls'

type Sort = 'name' | 'value_desc' | 'value_asc'

const SORT_LABEL: Record<Sort, string> = {
  name: 'Client name',
  value_desc: 'Highest value',
  value_asc: 'Lowest value',
}

const DEFAULT_VISIBLE = 8

/**
 * The live-accounts list, with a search box and a sort.
 *
 * Everything here is already loaded server-side (accounts is the whole
 * programme, not a page of it) — a partner's live-account count is small
 * enough that filtering in the browser is simpler and faster than a round
 * trip, unlike the Deals list which is paged from the database. Cristian on
 * the Loom walkthrough: "we're gonna need to be able to sort that, and
 * search for a client" — pointing at this exact list.
 */
export function AccountList({ accounts, canWrite }: { accounts: LiveAccount[]; canWrite: boolean }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [expanded, setExpanded] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matching = q
      ? accounts.filter(
          (a) =>
            a.clientName.toLowerCase().includes(q) ||
            a.personName.toLowerCase().includes(q) ||
            (a.teamName ?? '').toLowerCase().includes(q),
        )
      : accounts

    return [...matching].sort((a, b) => {
      if (sort === 'value_desc') return b.monthlyValue - a.monthlyValue
      if (sort === 'value_asc') return a.monthlyValue - b.monthlyValue
      return a.clientName.localeCompare(b.clientName)
    })
  }, [accounts, query, sort])

  if (accounts.length === 0) {
    return <p className="mt-6 text-[13.5px] text-muted">Nothing in the programme yet.</p>
  }

  const visible = expanded || query ? filtered : filtered.slice(0, DEFAULT_VISIBLE)
  const hiddenCount = filtered.length - visible.length

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <label className="min-w-[200px] flex-1">
          <span className="sr-only">Search accounts</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search client, rep, pod…"
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
        <p className="text-[13.5px] text-muted">No accounts match &ldquo;{query}&rdquo;.</p>
      ) : (
        <ul className="grid gap-1.5">
          {visible.map((a) => (
            <AccountRow key={a.dealId} account={a} canWrite={canWrite} />
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

function AccountRow({ account: a, canWrite }: { account: LiveAccount; canWrite: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[8px] border border-line bg-surface-2 px-3.5 py-2.5 text-[13.5px]">
      <span className="flex-1 truncate text-paper">{a.clientName}</span>
      <span className="text-[12px] text-muted">
        {a.personName}
        {a.teamName ? ` · ${a.teamName}` : ''}
      </span>
      {a.live === null ? <Pill tone="neutral">Pending</Pill> : null}
      <span className="num w-24 text-right text-paper">{fmtMoney(a.monthlyValue, true)}/mo</span>
      {canWrite ? (
        <span className="flex gap-1.5">
          {a.live === null ? <MarkLiveButton dealId={a.dealId} /> : null}
          <EditMonthlyValueButton dealId={a.dealId} clientName={a.clientName} monthlyValue={a.monthlyValue} />
          <MarkChurnedButton dealId={a.dealId} clientName={a.clientName} />
        </span>
      ) : null}
    </li>
  )
}
