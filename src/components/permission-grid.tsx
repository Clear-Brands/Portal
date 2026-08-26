'use client'

import { useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { useCloseOnSuccess } from '@/lib/use-close-on-success'
import { Button } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { updateProfilePerms } from '@/lib/actions/partners'
import {
  CAPABILITIES,
  CAPABILITIES_APPLICABLE_TO,
  ROLE_DEFAULTS,
  defaultKey,
  type Access,
  type Capability,
  type Role,
} from '@/lib/auth/capabilities'
import type { ActionState } from '@/lib/actions/deals'

const initial: ActionState = {}

export interface PermissionLogin {
  profileId: string
  name: string
  role: Role
  access: Access
  perms: Record<string, boolean>
}

/** What this login holds right now — an explicit override if one is stored,
 *  otherwise its role default. The same resolution `can()` does server-side. */
function effectiveCap(login: PermissionLogin, key: Capability): boolean {
  const explicit = login.perms[key]
  if (typeof explicit === 'boolean') return explicit
  return (ROLE_DEFAULTS[defaultKey(login.role, login.access)] ?? []).includes(key)
}

/**
 * The permissions grid, as a button-plus-dialog pair.
 *
 * Renders only the capabilities `CAPABILITIES_APPLICABLE_TO` says can change
 * anything for this login's role — see that table's comment in
 * capabilities.ts for how each one was verified against the actual policies
 * and pages that check it. `updateProfilePerms` re-derives the same set
 * server-side from the target's real role, so a tampered `scope` field cannot
 * smuggle in a capability the grid never should have offered.
 */
export function PermissionGridButton({
  login,
  size = 'sm',
}: {
  login: PermissionLogin
  size?: 'sm' | 'md'
}) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(updateProfilePerms, initial)

  useCloseOnSuccess(state.ok, setOpen)

  const applicable = CAPABILITIES_APPLICABLE_TO[login.role] ?? []
  if (applicable.length === 0) return null

  return (
    <>
      <Button size={size} variant="ghost" type="button" onClick={() => setOpen(true)}>
        Permissions
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Permissions — ${login.name}`}
        description="Only what differs from the role default is stored — unchecking a box that was already off changes nothing."
        confirmLabel="Save"
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ profileId: login.profileId, scope: applicable.join(',') }}
      >
        <div className="grid gap-2.5">
          {applicable.map((key) => (
            <label key={key} className="flex items-start gap-2.5 text-[13.5px] text-paper">
              <input
                type="checkbox"
                name={`cap.${key}`}
                defaultChecked={effectiveCap(login, key)}
                className="mt-1"
              />
              <span>
                <span className="block">{CAPABILITIES[key]}</span>
                <span className="block text-[11.5px] text-muted">{key}</span>
              </span>
            </label>
          ))}
        </div>
      </ConfirmDialog>
    </>
  )
}
