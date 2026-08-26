'use client'

import { useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { useCloseOnSuccess } from '@/lib/use-close-on-success'
import { Button, Field, Notice, inputClass } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { PermissionGridButton } from '@/components/permission-grid'
import { addPartnerAdminLogin } from '@/lib/actions/partners'
import type { ActionState } from '@/lib/actions/deals'
import type { PartnerLogin } from '@/lib/data/partners'

const initial: ActionState = {}

/** Admin-login management for one partner: who has one, and adding another. */
export function AdminLogins({
  partnerId,
  logins,
  canManagePerms,
}: {
  partnerId: string
  logins: PartnerLogin[]
  canManagePerms: boolean
}) {
  const admins = logins.filter((l) => l.role === 'partner_admin')

  return (
    <div className="grid gap-3">
      {admins.length === 0 ? (
        <p className="text-[13.5px] text-muted">No admin login yet.</p>
      ) : (
        <ul className="grid gap-1.5">
          {admins.map((login) => (
            <li
              key={login.id}
              className="flex flex-wrap items-center gap-3 rounded-[8px] border border-line bg-surface-2 px-3.5 py-2.5 text-[13.5px]"
            >
              <span className="flex-1 truncate text-paper">{login.name}</span>
              <span className="text-[12px] text-muted">{login.email}</span>
              {canManagePerms ? (
                <PermissionGridButton
                  login={{
                    profileId: login.id,
                    name: login.name,
                    role: login.role,
                    access: login.access,
                    perms: login.perms,
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <AddAdminButton partnerId={partnerId} />
    </div>
  )
}

function AddAdminButton({ partnerId }: { partnerId: string }) {
  const [state, action, pending] = useActionState(addPartnerAdminLogin, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  return (
    <>
      <div>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(true)}>
          Add an admin login
        </Button>
      </div>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add an admin login"
        description="Sends an invite email. They can sign in as soon as they accept it."
        confirmLabel="Send invite"
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ partnerId }}
      >
        <div className="grid gap-3.5">
          <Field label="Name">
            <input name="name" required className={inputClass} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required className={inputClass} />
          </Field>
        </div>
      </ConfirmDialog>

      {state.ok ? (
        <Notice tone="success">{state.ok}</Notice>
      ) : null}
    </>
  )
}
