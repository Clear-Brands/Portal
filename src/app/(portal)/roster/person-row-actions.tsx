'use client'

import { useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { useCloseOnSuccess } from '@/lib/use-close-on-success'
import { Button, Field, Pill, inputClass } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { PermissionGridButton } from '@/components/permission-grid'
import { editPerson, enablePortalLogin, promoteToPartnerAdmin, setPersonActive } from '@/lib/actions/roster'
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
  canPromote,
}: {
  person: RosterRow
  teams: TeamOption[]
  canWrite: boolean
  /** Only a Clear Brands admin or the person's own partner admin may grant or
   *  revoke capabilities — an internal manager sees the roster but not this. */
  canManagePerms: boolean
  /** Only Clear Brands staff may promote a rep-level login to partner admin —
   *  see the comment on promoteToPartnerAdmin in lib/actions/roster.ts. */
  canPromote: boolean
}) {
  const [editState, editAction, editPending] = useActionState(editPerson, initial)
  const [activeState, activeAction, activePending] = useActionState(setPersonActive, initial)
  const [inviteState, inviteAction, invitePending] = useActionState(enablePortalLogin, initial)
  const [promoteState, promoteAction, promotePending] = useActionState(promoteToPartnerAdmin, initial)

  const [editOpen, setEditOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [promoteOpen, setPromoteOpen] = useState(false)

  useCloseOnSuccess(editState.ok, setEditOpen)

  useCloseOnSuccess(activeState.ok, setDeactivateOpen)

  useCloseOnSuccess(promoteState.ok, setPromoteOpen)

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

      {person.login && person.login.role === 'member' && canPromote ? (
        <Button size="sm" variant="ghost" onClick={() => setPromoteOpen(true)}>
          Promote to partner admin
        </Button>
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
          <Field label="Title" hint="Optional — e.g. Director of Sales, Account Manager">
            <input name="title" defaultValue={person.title ?? ''} maxLength={120} className={inputClass} />
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

      <ConfirmDialog
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        title={`Promote ${person.name} to partner admin?`}
        description="They keep the same login and password — this only changes what they can see and do. Partner admins can see payouts and rev-share for their whole company, and manage the roster. You can't undo this from here afterward — ask engineering if you need to reverse it."
        confirmLabel="Promote"
        pending={promotePending}
        error={promoteState.error}
        formAction={promoteAction}
        hiddenFields={{ personId: person.id }}
      />
    </div>
  )
}
