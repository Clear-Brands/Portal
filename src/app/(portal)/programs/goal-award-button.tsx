'use client'

import { useEffect, useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, fmtCount } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { approveGoalAward } from '@/lib/actions/programs'
import type { ActionState } from '@/lib/actions/deals'

const initial: ActionState = {}

/**
 * Approving an annual goal prize.
 *
 * The single money-committing action in this phase, so it gets the same
 * treatment as recording a payout: a real dialog that names the person and the
 * prize before anything is written, gated on `payouts.write` on both sides.
 */
export function GoalAwardButton({
  goalId,
  personId,
  personName,
  prize,
  closes,
  target,
}: {
  goalId: string
  personId: string
  personName: string
  prize: string
  closes: number
  target: number
}) {
  const [state, action, pending] = useActionState(approveGoalAward, initial)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state.ok])

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Approve
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Approve ${personName}'s prize?`}
        description="This commits the prize. It stays on the record and shows up on the prize list as approved."
        confirmLabel="Approve it"
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ goalId, personId }}
      >
        <dl className="grid gap-2.5 rounded-[8px] border border-line bg-surface-2 px-4 py-3.5 text-[14px]">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-head text-[11px] tracking-[0.12em] text-muted uppercase">Hit</dt>
            <dd className="num text-right text-paper">
              {fmtCount(closes)} of {fmtCount(target)} closes
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-head text-[11px] tracking-[0.12em] text-muted uppercase">Prize</dt>
            <dd className="text-right text-volt">{prize}</dd>
          </div>
        </dl>
      </ConfirmDialog>
    </>
  )
}
