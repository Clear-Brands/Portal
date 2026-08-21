'use client'

import { useActionState, useEffect, useState } from 'react'

import { Button, Field, Pill, inputClass } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { PermissionGridButton } from '@/components/permission-grid'
import { editPerson, enablePortalLogin, setPersonActive } from '@/lib/actions/roster'
import type { ActionState } from '@/lib/actions/deals'
import type { RosterRow } from '@/lib/data/roster'
import type { TeamOption } from '@/lib/types'

const initial: ActionState = {}

/**
 * Row actions for one roster entry: edit, deactivate/reactivate, and — the one
 * action that reaches outside the database — sending a portal login invite.
 *
 * Deactivating asks first because it removes someone's ability to sign in
 * right away; reactivating and inviting are one click, matching how the deals
 * page treats its own low-risk transitions (see MarkLiveButton on the rev
 * share page).
 */
export function PersonRowActions({
  person,
  teams,
  canWrite,
  canManagePerms,
}: {
  person: RosterRow
  teams: TeamOption[]
  canWrite: boolean
  /** Only a Clear Brands admin or the person's own partner admin may grant or
   *  revoke capabilities — an internal manager sees the roster but not this. */
  canManagePerms: boolean
}) {
  const [editState, editAction, editPending] = useActionState(editPerson, initial)
  const [activeState, activeAction, activePending] = useActionState(setPersonActive, initial)
  const [inviteState, inviteAction, invitePending] = useActionState(enablePortalLogin, initial)

  const [editOpen, setEditOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)

  useEffect(() => {
    if (editState.ok) setEditOpen(false)
  }, [editState.ok])

  useEffect(() => {
    if (activeState.ok) setDeactivateOpen(false)
  }, [activeState.ok])

  if (!canWrite) return null

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
        Edit
      </Button>

      {person.active ? (
        <Button size="sm" variant="ghost" onClick={() => setDeactivateOpen(true)}>
          Deactivate
        </Button>
      ) : (
        <form action={activeAction}>
          <input type="hidden" name="personId" value={person.id} />
          <input type="hidden" name="active" value="true" />
          <Button size="sm" type="submit" disabled={activePending}>
            Reactivate
          </Button>
        </form>
      )}

      {!person.hasLogin && person.active ? (
        <form action={inviteAction}>
          <input type="hidden" name="personId" value={person.id} />
          <Button size="sm" variant="ghost" type="submit" disabled={invitePending}>
            {invitePending ? 'Sending…' : 'Send login invite'}
          </Button>
        </form>
      ) : null}

      {person.login && canManagePerms ? (
        <PermissionGridButton
          login={{
            profileId: person.login.profileId,
            name: person.name,
            role: person.login.role,
            access: person.login.access,
            perms: person.login.perms,
          }}
        />
      ) : null}

      {person.hasLogin ? <Pill tone="neutral">Has login</Pill> : null}

      {inviteState.error ? (
        <p role="alert" className="w-full text-right text-[12px] text-danger">
          {inviteState.error}
        </p>
      ) : null}

      <ConfirmDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${person.name}`}
        confirmLabel="Save"
        pending={editPending}
        error={editState.error}
        formAction={editAction}
        hiddenFields={{ personId: person.id }}
      >
        <div className="grid gap-3.5">
          <Field label="Name">
            <input name="name" required defaultValue={person.name} className={inputClass} />
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              required
              defaultValue={person.email}
              className={inputClass}
            />
          </Field>
          <Field label="Pod">
            <select name="teamId" defaultValue={person.teamId ?? ''} className={inputClass}>
              <option value="">No pod</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        title={`Deactivate ${person.name}?`}
        description="A pause, not a forfeiture — they lose portal access right away, but anything already earned stays payable. Reactivate any time."
        confirmLabel="Deactivate"
        destructive
        pending={activePending}
        error={activeState.error}
        formAction={activeAction}
        hiddenFields={{ personId: person.id, active: 'false' }}
      />
    </div>
  )
}
