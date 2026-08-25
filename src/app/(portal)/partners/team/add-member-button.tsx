'use client'

import { useEffect, useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Field, Notice, inputClass } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { addInternalLogin } from '@/lib/actions/partners'
import type { ActionState } from '@/lib/actions/deals'

const initial: ActionState = {}

/**
 * "I don't see a spot to add a team member" — Cristian, Loom walkthrough.
 * This is that spot: a Clear Brands login (manager or admin), same invite
 * flow as an admin login for a partner, just scoped internal instead.
 */
export function AddMemberButton() {
  const [state, action, pending] = useActionState(addInternalLogin, initial)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state.ok])

  return (
    <>
      <Button size="sm" type="button" onClick={() => setOpen(true)}>
        Add a team member
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add a Clear Brands team member"
        description="Sends an invite email. They can sign in as soon as they accept it, then you can grant or revoke specific capabilities from this page."
        confirmLabel="Send invite"
        pending={pending}
        error={state.error}
        formAction={action}
      >
        <div className="grid gap-3.5">
          <Field label="Name">
            <input name="name" required maxLength={160} className={inputClass} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required className={inputClass} />
          </Field>
          <Field label="Title" hint="Optional — e.g. Director of Sales, Accounting">
            <input name="title" maxLength={120} className={inputClass} />
          </Field>
          <Field label="Access">
            <select name="accessLevel" defaultValue="manager" className={inputClass}>
              <option value="manager">Manager — day-to-day work, no money writes by default</option>
              <option value="admin">Admin — holds every capability</option>
            </select>
          </Field>
        </div>
      </ConfirmDialog>

      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}
    </>
  )
}
