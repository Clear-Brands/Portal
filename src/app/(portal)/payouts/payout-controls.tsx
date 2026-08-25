'use client'

import { useEffect, useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, fmtMoney } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { recordPayout, voidPayout } from '@/lib/actions/payouts'
import { approveDealComp, type ActionState } from '@/lib/actions/deals'

const initial: ActionState = {}

/**
 * Recording a payout.
 *
 * This is the most consequential action in the product: it settles every payable
 * deal and tells every rep their money is on the way. In the original it was a
 * `confirm()` — a grey browser box with one sentence in it.
 *
 * Here the dialog states the amount, the number of people and the number of
 * deals, and asks for the ACH reference to be typed rather than pasted from
 * somewhere. The total shown is the one the database will compute; the form
 * never sends an amount.
 */
export function RecordPayoutButton({
  total,
  people,
  deals,
  alreadyRecorded,
}: {
  total: number
  people: number
  deals: number
  alreadyRecorded: boolean
}) {
  const [state, action, pending] = useActionState(recordPayout, initial)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state.ok])

  if (alreadyRecorded) {
    return (
      <p className="text-[13px] text-muted">
        This month&rsquo;s transfer is already recorded. Void it if it needs correcting.
      </p>
    )
  }

  if (total <= 0) {
    return <p className="text-[13px] text-muted">Nothing is payable right now.</p>
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
        title="Record this transfer?"
        description="Send the ACH from your bank first, then record it here. This settles every payable deal and notifies the reps."
        confirmLabel="Record it"
        pending={pending}
        error={state.error}
        formAction={action}
      >
        <div className="rounded-[8px] border border-line bg-surface-2 px-4 py-4">
          <p className="font-head text-[11px] tracking-[0.15em] text-muted uppercase">
            Total to transfer
          </p>
          <p className="num mt-1 font-head text-[34px] leading-none text-volt">
            {fmtMoney(total, true)}
          </p>
          <p className="mt-2 text-[13px] text-muted">
            <span className="num">{deals}</span> {deals === 1 ? 'deal' : 'deals'} across{' '}
            <span className="num">{people}</span> {people === 1 ? 'person' : 'people'}
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
            placeholder="ACH 8841-2207"
            className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 text-[15px] text-paper placeholder:text-muted/60"
          />
          <span className="mt-1.5 block text-[12.5px] text-muted">
            From your bank&rsquo;s confirmation. This is what makes the batch traceable a year from
            now.
          </span>
        </label>
      </ConfirmDialog>
    </>
  )
}

/**
 * Voiding a batch.
 *
 * A void is an entry, not an erasure: the batch stays in the history marked
 * void, keeps every line item, and its deals return to payable. The reason is
 * required and permanent, so the record can always explain itself.
 */
export function VoidPayoutButton({
  payoutId,
  reference,
  total,
}: {
  payoutId: string
  reference: string
  total: number
}) {
  const [state, action, pending] = useActionState(voidPayout, initial)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state.ok])

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        Void
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Void this transfer?"
        description="Its deals go back to payable. The batch stays in the history marked void, with its line items intact."
        confirmLabel="Void it"
        destructive
        requireTyped={{ label: `Type the reference to confirm — ${reference}`, value: reference }}
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ payoutId }}
      >
        <p className="text-[14px] text-muted">
          <span className="num text-paper">{fmtMoney(total, true)}</span> will become payable again.
        </p>

        <label className="mt-4 block">
          <span className="mb-1.5 block font-head text-[12px] tracking-[0.1em] text-muted uppercase">
            Why
          </span>
          <textarea
            name="reason"
            rows={2}
            required
            placeholder="Wrong ACH reference, transfer failed, wrong month…"
            className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 text-[15px] text-paper placeholder:text-muted/60"
          />
        </label>
      </ConfirmDialog>
    </>
  )
}

/**
 * Approving one flat-fee deal's comp — the one-time gate a flat-fee partner's
 * closed deals need before they can be swept into a payout (0016_flat_fee_approval.sql).
 * A deliberate small confirmation, not a `confirm()`, same as everything else
 * that moves money in this product.
 */
export function ApproveCompButton({
  dealId,
  clientName,
  spiffAmount,
  partnerComp,
  ongoingRevshare,
  monthlyValue,
  revsharePct,
}: {
  dealId: string
  clientName: string
  spiffAmount: number
  partnerComp: number
  ongoingRevshare: boolean
  monthlyValue: number
  revsharePct: number
}) {
  const [state, action, pending] = useActionState(approveDealComp, initial)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (state.ok) setOpen(false)
  }, [state.ok])

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Approve
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Approve ${clientName}?`}
        description={
          ongoingRevshare
            ? "A one-time check before this starts accruing — once approved, it joins the ongoing rev-share programme and can be billed in the next monthly statement."
            : 'A one-time check before this can be paid — once approved, it moves into the payable batch above and can be swept into the next transfer.'
        }
        confirmLabel="Approve"
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ dealId }}
      >
        <div className="rounded-[8px] border border-line bg-surface-2 px-4 py-4">
          {spiffAmount > 0 ? (
            <p className="text-[13px] text-muted">
              <span className="num text-paper">{fmtMoney(spiffAmount, true)}</span> to the rep
            </p>
          ) : null}
          {ongoingRevshare ? (
            <p className="mt-1 text-[13px] text-muted">
              <span className="num text-paper">{fmtMoney(monthlyValue, true)}</span>/mo at{' '}
              <span className="num text-paper">{revsharePct}%</span> — ongoing, to the company
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-muted">
              <span className="num text-paper">{fmtMoney(partnerComp, true)}</span> to the company
            </p>
          )}
        </div>
      </ConfirmDialog>
    </>
  )
}
