'use client'

import { useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { useCloseOnSuccess } from '@/lib/use-close-on-success'
import { Button } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { closeSprint, reopenSprint } from '@/lib/actions/programs'
import type { ActionState } from '@/lib/actions/deals'

const initial: ActionState = {}

/**
 * Closing a sprint.
 *
 * A sprint's end date is a target, not a cutoff — standings keep moving
 * until someone clicks this. It's the only real "final" in the new prize
 * model, so it gets the same real-dialog treatment as recording a payout
 * rather than a bare confirm(): name the leading pod before anything freezes.
 */
export function CloseSprintButton({
  sprintId,
  sprintName,
  leadingPodName,
}: {
  sprintId: string
  sprintName: string
  leadingPodName: string | null
}) {
  const [state, action, pending] = useActionState(closeSprint, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Close sprint
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Close ${sprintName}?`}
        description="Freezes standings exactly as they stand right now. Any deal that closes or gets corrected afterward won't change who won — reopen the sprint first if that happens."
        confirmLabel="Close it"
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ sprintId }}
      >
        {leadingPodName ? (
          <p className="text-[14px] text-muted">
            <span className="text-paper">{leadingPodName}</span> is currently in 1st.
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  )
}

/**
 * Reopening a closed sprint — the undo. Not in Cristian's doc, but a
 * one-way freeze on real prize money is exactly the kind of thing that
 * needs one: a wrong close, a deal correction that should have counted.
 * Danger-styled like VoidPayoutButton, since it un-finalizes something a
 * prize may already have been paid out against.
 */
export function ReopenSprintButton({ sprintId, sprintName }: { sprintId: string; sprintName: string }) {
  const [state, action, pending] = useActionState(reopenSprint, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        Reopen
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Reopen ${sprintName}?`}
        description="Standings go live again and will keep moving with every new close, until this is closed a second time. If a prize was already paid out on the frozen result, check with the rep before it changes under them."
        confirmLabel="Reopen it"
        destructive
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ sprintId }}
      />
    </>
  )
}
