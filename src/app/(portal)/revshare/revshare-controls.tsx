'use client'

import { useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { useCloseOnSuccess } from '@/lib/use-close-on-success'
import { Button, Field, fmtMoney, inputClass } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import {
  addDealToRevshareProgramme,
  recordRevshareStatement,
  setAccountLiveState,
  updateAccountMonthlyValue,
  voidRevshareStatement,
} from '@/lib/actions/revshare'
import type { ActionState } from '@/lib/actions/deals'

const initial: ActionState = {}

/** Same treatment as RecordPayoutButton — the total shown is what the server
 *  will compute fresh, the form never sends an amount. */
export function RecordRevshareButton({
  total,
  accounts,
  alreadyRecorded,
}: {
  total: number
  accounts: number
  alreadyRecorded: boolean
}) {
  const [state, action, pending] = useActionState(recordRevshareStatement, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  if (alreadyRecorded) {
    return (
      <p className="text-[13px] text-muted">
        This month&rsquo;s statement is already recorded. Void it if it needs correcting.
      </p>
    )
  }

  if (total <= 0) {
    return <p className="text-[13px] text-muted">No live accounts to bill right now.</p>
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Review and record {fmtMoney(total)}</Button>

      {state.error && !open ? (
        <p role="alert" className="mt-2 text-[12.5px] text-danger">
          {state.error}
        </p>
      ) : null}

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record this month's statement?"
        description="Send the ACH from your bank first, then record it here. This bills every live account for the month."
        confirmLabel="Record it"
        pending={pending}
        error={state.error}
        formAction={action}
      >
        <div className="rounded-[8px] border border-line bg-surface-2 px-4 py-4">
          <p className="font-head text-[11px] tracking-[0.15em] text-muted uppercase">
            Monthly base
          </p>
          <p className="num mt-1 font-head text-[34px] leading-none text-volt">
            {fmtMoney(total, true)}
          </p>
          <p className="mt-2 text-[13px] text-muted">
            Across <span className="num">{accounts}</span> {accounts === 1 ? 'account' : 'accounts'}. The
            statement total is the partner&rsquo;s configured percentage of this base, computed when it
            saves.
          </p>
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block font-head text-[12px] tracking-[0.1em] text-muted uppercase">
            ACH reference
          </span>
          <input
            name="reference"
            required
            autoComplete="off"
            placeholder="ACH RS-2607"
            className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 text-[15px] text-paper placeholder:text-muted/60"
          />
        </label>
      </ConfirmDialog>
    </>
  )
}

export function VoidRevshareButton({
  statementId,
  reference,
  total,
}: {
  statementId: string
  reference: string
  total: number
}) {
  const [state, action, pending] = useActionState(voidRevshareStatement, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        Void
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Void this statement?"
        confirmLabel="Void it"
        destructive
        requireTyped={{ label: `Type the reference to confirm — ${reference}`, value: reference }}
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ statementId }}
      >
        <p className="text-[14px] text-muted">
          <span className="num text-paper">{fmtMoney(total, true)}</span> stays voided on the record —
          the line items are kept.
        </p>

        <label className="mt-4 block">
          <span className="mb-1.5 block font-head text-[12px] tracking-[0.1em] text-muted uppercase">
            Why
          </span>
          <textarea
            name="reason"
            rows={2}
            required
            placeholder="Wrong reference, wrong month…"
            className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 text-[15px] text-paper placeholder:text-muted/60"
          />
        </label>
      </ConfirmDialog>
    </>
  )
}

/** Marking an account churned stops it from billing next month — worth a beat
 *  of friction. Marking it live again does not, so that one is instant. */
export function MarkChurnedButton({ dealId, clientName }: { dealId: string; clientName: string }) {
  const [state, action, pending] = useActionState(setAccountLiveState, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Mark churned
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Mark ${clientName} churned?`}
        description="It drops out of next month's statement. Nothing already billed changes."
        confirmLabel="Mark churned"
        destructive
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ dealId, live: 'false' }}
      >
        <label className="block">
          <span className="mb-1.5 block font-head text-[12px] tracking-[0.1em] text-muted uppercase">
            Why (shows on the deals tab)
          </span>
          <textarea
            name="note"
            rows={2}
            placeholder="Cancelled, switched agencies, stopped responding…"
            className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 text-[15px] text-paper placeholder:text-muted/60"
          />
        </label>
      </ConfirmDialog>
    </>
  )
}

/** Edit a live (or pending) account's monthly value in place — the contract
 *  changed, so the number this page bills against needs to. */
export function EditMonthlyValueButton({
  dealId,
  clientName,
  monthlyValue,
}: {
  dealId: string
  clientName: string
  monthlyValue: number
}) {
  const [state, action, pending] = useActionState(updateAccountMonthlyValue, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Edit
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${clientName}'s monthly value?`}
        description="Changes what future statements bill this account at. Anything already recorded stays as it was."
        confirmLabel="Save"
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ dealId }}
      >
        <Field label="Monthly value" hint="What this account bills the partner per month">
          <input
            className={inputClass}
            name="monthlyValue"
            type="number"
            min={0.01}
            step="0.01"
            required
            defaultValue={monthlyValue}
          />
        </Field>
      </ConfirmDialog>
    </>
  )
}

export function MarkLiveButton({ dealId }: { dealId: string }) {
  const [, action, pending] = useActionState(setAccountLiveState, initial)
  return (
    <form action={action}>
      <input type="hidden" name="dealId" value={dealId} />
      <input type="hidden" name="live" value="true" />
      <Button size="sm" variant="ghost" type="submit" disabled={pending}>
        Mark live
      </Button>
    </form>
  )
}

/** "add a closed client to the programme" — opt an existing closed deal into
 *  recurring rev share by giving it a monthly value. */
export function AddToProgrammeButton({
  candidates,
}: {
  candidates: { dealId: string; clientName: string; personName: string; closedAt: string | null }[]
}) {
  const [state, action, pending] = useActionState(addDealToRevshareProgramme, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  if (candidates.length === 0) return null

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Add a closed client
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add a closed client to the programme"
        description="Picks up billing from here — nothing retroactive."
        confirmLabel="Add it"
        pending={pending}
        error={state.error}
        formAction={action}
      >
        <Field label="Client">
          <select className={inputClass} name="dealId" required defaultValue="">
            <option value="" disabled>
              Choose a closed deal…
            </option>
            {candidates.map((c) => (
              <option key={c.dealId} value={c.dealId}>
                {c.clientName} — {c.personName}
                {c.closedAt ? ` (closed ${c.closedAt})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <div className="mt-4">
          <Field label="Monthly value" hint="What this account bills the partner per month">
            <input className={inputClass} name="monthlyValue" type="number" min={0.01} step="0.01" required />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  )
}
