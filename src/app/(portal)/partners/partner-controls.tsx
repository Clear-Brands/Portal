'use client'

import { useEffect, useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { Button } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { archivePartner, restorePartner } from '@/lib/actions/partners'
import type { ActionState } from '@/lib/actions/deals'

const initial: ActionState = {}

/**
 * Archiving pauses a programme; it never deletes one. The database refuses to
 * archive the last active partner (0014_partners_and_permissions.sql) — the
 * error from that guard surfaces here exactly like any other action error.
 */
export function ArchivePartnerButton({ partnerId, name }: { partnerId: string; name: string }) {
  const [state, action, pending] = useActionState(archivePartner, initial)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state.ok])

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Archive
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Archive ${name}?`}
        description="Their programme pauses — no new deals, no billing — but nothing is deleted, and you can restore it any time."
        confirmLabel="Archive"
        destructive
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ partnerId }}
      />
    </>
  )
}

export function RestorePartnerButton({ partnerId }: { partnerId: string }) {
  const [state, action, pending] = useActionState(restorePartner, initial)

  return (
    <form action={action}>
      <input type="hidden" name="partnerId" value={partnerId} />
      <Button size="sm" type="submit" disabled={pending}>
        {pending ? 'Restoring…' : 'Restore'}
      </Button>
      {state.error ? <p className="mt-1 text-[12px] text-danger">{state.error}</p> : null}
    </form>
  )
}
