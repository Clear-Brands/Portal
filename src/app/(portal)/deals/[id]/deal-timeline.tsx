import { DEAL_STATUS_LABEL } from '@/lib/types'
import type { StageDuration } from '@/lib/data/deals'

/**
 * How long a deal sat in each stage — Cristian's ask: "how long has each
 * deal been in each stage until it's either first invoice paid or lost."
 * Built from deal_status_history (0026), logged automatically on every
 * transition, so this reads what actually happened rather than an estimate.
 */
export function DealTimeline({ stages }: { stages: StageDuration[] }) {
  if (stages.length === 0) {
    return <p className="text-[13.5px] text-muted">No history recorded yet.</p>
  }

  return (
    <ol className="grid gap-2.5">
      {stages.map((s, i) => (
        <li key={`${s.status}-${s.enteredAt}`} className="flex items-center gap-3 text-[14px]">
          <span className="w-5 shrink-0 text-center text-[12px] text-muted">{i + 1}</span>
          <span className="flex-1 text-paper">{DEAL_STATUS_LABEL[s.status]}</span>
          <span className="num text-muted">
            {s.days} {s.days === 1 ? 'day' : 'days'}
            {s.current ? ' so far' : ''}
          </span>
        </li>
      ))}
    </ol>
  )
}
