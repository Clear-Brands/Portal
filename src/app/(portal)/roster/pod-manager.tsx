'use client'

import { useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, inputClass } from '@/components/ui'
import { Dialog, DialogActions } from '@/components/dialog'
import { addPod, removePod, renamePod } from '@/lib/actions/teams'
import type { ActionState } from '@/lib/actions/deals'
import type { TeamOption } from '@/lib/types'

const initial: ActionState = {}

type PodWithCount = TeamOption & { count: number }

/**
 * Add, rename and remove pods — internal-only (see the comment on these
 * actions in lib/actions/teams.ts). Everything lives in one dialog rather
 * than three separate ones: rename and remove are both a single click away
 * inline, with no nested modal, since a pod is a small enough thing to
 * manage without its own confirm screen for every edit.
 */
export function PodManager({ pods }: { pods: PodWithCount[] }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(true)}>
        Manage pods
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Pods"
        description="Partner admins assign people into a pod from the roster's Edit action — adding, renaming or removing the pods themselves is Clear Brands only."
        width="md"
      >
        <div className="grid gap-2">
          {pods.length === 0 ? (
            <p className="text-[13.5px] text-muted">No pods yet.</p>
          ) : (
            pods.map((pod) => <PodRow key={pod.id} pod={pod} />)
          )}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <AddPodForm />
        </div>

        <DialogActions>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function PodRow({ pod }: { pod: PodWithCount }) {
  const [renameState, renameAction, renamePending] = useActionState(renamePod, initial)
  const [removeState, removeAction, removePending] = useActionState(removePod, initial)
  const [name, setName] = useState(pod.name)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const dirty = name.trim() !== pod.name && name.trim().length > 0

  return (
    <div className="rounded-[8px] border border-line bg-surface-2 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          aria-hidden
          className="h-[9px] w-[9px] shrink-0 rounded-full"
          style={{ backgroundColor: pod.color }}
        />

        <form action={renameAction} className="flex min-w-[160px] flex-1 items-center gap-2">
          <input type="hidden" name="teamId" value={pod.id ?? ''} />
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="w-full rounded-[6px] border border-line bg-surface px-2.5 py-1.5 text-[13.5px] text-paper"
          />
          {dirty ? (
            <Button size="sm" type="submit" disabled={renamePending}>
              {renamePending ? 'Saving…' : 'Save'}
            </Button>
          ) : null}
        </form>

        <span className="whitespace-nowrap text-[12px] text-muted">
          {pod.count} {pod.count === 1 ? 'person' : 'people'}
        </span>

        {confirmingRemove ? (
          <form action={removeAction} className="flex items-center gap-1.5">
            <input type="hidden" name="teamId" value={pod.id ?? ''} />
            <span className="text-[12px] text-danger">Remove?</span>
            <Button size="sm" variant="danger" type="submit" disabled={removePending}>
              {removePending ? 'Removing…' : 'Yes'}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setConfirmingRemove(false)}>
              No
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="ghost" type="button" onClick={() => setConfirmingRemove(true)}>
            Remove
          </Button>
        )}
      </div>

      {renameState.error ? <p className="mt-1.5 text-[12px] text-danger">{renameState.error}</p> : null}
      {removeState.error ? <p className="mt-1.5 text-[12px] text-danger">{removeState.error}</p> : null}
    </div>
  )
}

function AddPodForm() {
  const [state, action, pending] = useActionState(addPod, initial)
  const [name, setName] = useState('')

  // Clear the field once a pod is actually added, so the form is ready for
  // the next one — adjusted during render rather than in a useEffect, same
  // reasoning as the pattern documented in use-close-on-success.ts.
  const [lastOk, setLastOk] = useState(state.ok)
  if (state.ok !== lastOk) {
    setLastOk(state.ok)
    if (state.ok) setName('')
  }

  return (
    <form action={action} className="grid gap-2">
      <span className="font-head text-[12px] tracking-[0.1em] text-muted uppercase">Add a pod</span>
      <div className="flex items-center gap-2.5">
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. West Region"
          maxLength={120}
          className={inputClass}
        />
        <Button type="submit" disabled={!name.trim() || pending}>
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {state.error ? <p className="text-[12px] text-danger">{state.error}</p> : null}
    </form>
  )
}
