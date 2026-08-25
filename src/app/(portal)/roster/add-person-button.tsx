'use client'

import { useEffect, useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Field, Notice, inputClass } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { addPerson } from '@/lib/actions/roster'
import type { ActionState } from '@/lib/actions/deals'
import type { TeamOption } from '@/lib/types'

const initial: ActionState = {}

/**
 * "Sometimes I just need to add one person, not a whole spreadsheet" —
 * Cristian, Loom walkthrough. Sits next to Import CSV as the one-at-a-time
 * sibling: same roster, same `people.write` gate, same manager restriction
 * (only Clear Brands staff may add a pod manager — see the comment on
 * `addPerson`), it just skips the file entirely.
 */
export function AddPersonButton({
  teams,
  canAddManager,
}: {
  teams: TeamOption[]
  canAddManager: boolean
}) {
  const [state, action, pending] = useActionState(addPerson, initial)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state.ok])

  return (
    <>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(true)}>
        Add member
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add to the roster"
        description="One person, right now — for a whole file at once, use Import CSV instead."
        confirmLabel="Add"
        pending={pending}
        error={state.error}
        formAction={action}
      >
        <div className="grid gap-3.5">
          <Field label="Name">
            <input name="name" required maxLength={160} className={inputClass} autoFocus />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required className={inputClass} />
          </Field>
          <Field label="Pod" hint="Optional — leave blank for no pod">
            <select name="teamId" defaultValue="" className={inputClass}>
              <option value="">No pod</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title" hint="Optional — e.g. Director of Sales, Account Manager">
            <input name="title" maxLength={120} className={inputClass} />
          </Field>
          {canAddManager ? (
            <Field label="Kind">
              <select name="kind" defaultValue="rep" className={inputClass}>
                <option value="rep">Rep</option>
                <option value="manager">Manager</option>
              </select>
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-[13.5px] text-paper">
            <input type="checkbox" name="createLogin" />
            Also send a portal login invite
          </label>
        </div>
      </ConfirmDialog>

      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}
    </>
  )
}
