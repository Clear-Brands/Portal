'use client'

import { useOptimistic, useState, useTransition } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'

import { cn, fmtCount, fmtMoney, Notice } from '@/components/ui'
import { transitionDeal } from '@/lib/actions/deals'
import { DEAL_STATUS_LABEL, PIPELINE_ORDER, type DealStatus } from '@/lib/types'
import type { DealRow } from '@/lib/data/deals'

/**
 * The pipeline board.
 *
 * Two things the original's kanban could not do:
 *
 *   * Keyboard. It used the HTML5 drag-and-drop API, which is mouse-only. This
 *     uses dnd-kit's KeyboardSensor, so a card can be picked up with Space and
 *     moved with the arrow keys.
 *   * Tell the truth about size. It rendered every card in every column. This
 *     shows the newest 40 per column and says so when there are more, rather
 *     than looking complete while quietly omitting rows.
 */
export function PipelineBoard({
  columns,
  counts,
  perColumn,
  showMoney,
  canWrite,
}: {
  columns: Record<DealStatus, DealRow[]>
  counts: Record<string, number>
  perColumn: number
  showMoney: boolean
  canWrite: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const [board, moveCard] = useOptimistic(
    columns,
    (state, { dealId, to }: { dealId: string; to: DealStatus }) => {
      const next: Record<string, DealRow[]> = {}
      let moved: DealRow | undefined

      for (const [status, deals] of Object.entries(state)) {
        next[status] = deals.filter((d) => {
          if (d.id === dealId) {
            moved = d
            return false
          }
          return true
        })
      }

      if (moved) next[to] = [{ ...moved, status: to }, ...(next[to] ?? [])]
      return next as Record<DealStatus, DealRow[]>
    },
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  function onDragEnd(event: DragEndEvent) {
    const dealId = String(event.active.id)
    const to = event.over?.id as DealStatus | undefined
    if (!to) return

    const deal = Object.values(board)
      .flat()
      .find((d) => d.id === dealId)
    if (!deal || deal.status === to) return

    if (to === 'paid') {
      setError('Deals become Paid by recording a payout, not by dragging them here.')
      return
    }
    if (to === 'lost') {
      setError('Marking a deal lost needs a reason — use the Lost button on the deals list.')
      return
    }
    if (deal.locked) {
      setError('That deal is part of a recorded payout. Void the payout to move it.')
      return
    }

    setError(null)

    startTransition(async () => {
      moveCard({ dealId, to })

      const formData = new FormData()
      formData.set('dealId', dealId)
      formData.set('status', to)
      const result = await transitionDeal({}, formData)
      if (result.error) setError(result.error)
    })
  }

  return (
    <>
      {error ? (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-[repeat(5,minmax(200px,1fr))] gap-3 overflow-x-auto pb-3">
          {PIPELINE_ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              deals={board[status] ?? []}
              total={counts[status] ?? 0}
              perColumn={perColumn}
              showMoney={showMoney}
              canWrite={canWrite}
            />
          ))}
        </div>
      </DndContext>
    </>
  )
}

function Column({
  status,
  deals,
  total,
  perColumn,
  showMoney,
  canWrite,
}: {
  status: DealStatus
  deals: DealRow[]
  total: number
  perColumn: number
  showMoney: boolean
  canWrite: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const sum = deals.reduce((n, d) => n + d.spiffAmount, 0)

  return (
    <section
      ref={setNodeRef}
      aria-label={DEAL_STATUS_LABEL[status]}
      className={cn(
        'flex min-h-[220px] flex-col rounded-[12px] border border-line bg-surface/60 p-2.5',
        isOver && 'border-volt/50 bg-volt-dim',
      )}
    >
      <header className="mb-2.5 px-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-head text-[12px] tracking-[0.12em] text-muted uppercase">
            {DEAL_STATUS_LABEL[status]}
          </h2>
          <span className="num text-[12px] text-muted">{fmtCount(total)}</span>
        </div>
        {showMoney && sum > 0 ? (
          <p className="num mt-0.5 text-[12px] text-volt">{fmtMoney(sum)}</p>
        ) : null}
      </header>

      <div className="flex flex-col gap-2">
        {deals.map((deal) => (
          <Card key={deal.id} deal={deal} showMoney={showMoney} draggable={canWrite} />
        ))}

        {deals.length === 0 ? (
          <p className="px-1.5 py-4 text-[12.5px] text-muted">Nothing here.</p>
        ) : null}

        {/* No silent truncation: if the column is capped, it says so. */}
        {total > deals.length ? (
          <p className="px-1.5 py-2 text-[12px] text-muted">
            Showing the newest {perColumn} of {fmtCount(total)}. Use the list view to see them all.
          </p>
        ) : null}
      </div>
    </section>
  )
}

function Card({
  deal,
  showMoney,
  draggable,
}: {
  deal: DealRow
  showMoney: boolean
  draggable: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    disabled: !draggable || deal.locked,
  })

  return (
    <article
      ref={setNodeRef}
      {...(draggable && !deal.locked ? { ...listeners, ...attributes } : {})}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        'rounded-[10px] border border-line bg-surface-2 px-3 py-2.5',
        draggable && !deal.locked && 'cursor-grab active:cursor-grabbing',
        isDragging && 'z-50 opacity-90 shadow-2xl',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13.5px] leading-snug text-paper">{deal.clientName}</p>
        {deal.locked ? (
          <span title="In a recorded payout" aria-label="Locked — in a recorded payout">
            🔒
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[12px] text-muted">{deal.personName}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        {showMoney ? (
          <span className="num text-[12px] text-volt">{fmtMoney(deal.spiffAmount)}</span>
        ) : (
          <span />
        )}
        {(deal.status === 'submitted' || deal.status === 'in_talks') && deal.ageDays >= 30 ? (
          <span className="text-[11px] text-warn">⚠ {deal.ageDays}d</span>
        ) : null}
      </div>
    </article>
  )
}
