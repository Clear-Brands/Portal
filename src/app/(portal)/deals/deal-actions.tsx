'use client'

import { useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { useCloseOnSuccess } from '@/lib/use-close-on-success'

import { Button, Pill, fmtMoney } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { transitionDeal, type ActionState } from '@/lib/actions/deals'
import { DEAL_STATUS_LABEL } from '@/lib/types'
import type { DealRow } from '@/lib/data/deals'

const initial: ActionState = {}

/**
 * Row actions for a deal.
 *
 * Every transition goes through one server action, which calls one database
 * function, which enforces the rules. There is no second path — in the original,
 * four separate button handlers wrote status directly and skipped the guarded
 * transition, so the "this deal is in a recorded payout" lock could be walked
 * straight past by clicking the right button.
 */
export function DealActions({ deal, canWrite }: { deal: DealRow; canWrite: boolean }) {
  const [state, action, pending] = useActionState(transitionDeal, initial)
  const [lostOpen, setLostOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)

  useCloseOnSuccess(state.ok, () => {
    setLostOpen(false)
    setCloseOpen(false)
  })

  if (!canWrite) return null

  if (deal.locked) {
    return (
      <span className="text-[12px] text-muted" title="Void the payout to move this deal">
        🔒 In a recorded payout
      </span>
    )
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {deal.status === 'submitted' ? (
        <form action={action}>
          <input type="hidden" name="dealId" value={deal.id} />
          <input type="hidden" name="status" value="in_talks" />
          <Button size="sm" variant="ghost" type="submit" disabled={pending}>
            In talks
          </Button>
        </form>
      ) : null}

      {(deal.status === 'submitted' || deal.status === 'in_talks') ? (
        <>
          <Button size="sm" onClick={() => setCloseOpen(true)}>
            First invoice paid
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLostOpen(true)}>
            Lost
          </Button>
        </>
      ) : null}

      {deal.status === 'closed' ? (
        <form action={action}>
          <input type="hidden" name="dealId" value={deal.id} />
          <input type="hidden" name="status" value="in_talks" />
          <Button size="sm" variant="ghost" type="submit" disabled={pending}>
            Back to In talks
          </Button>
        </form>
      ) : null}

      {deal.status === 'lost' ? (
        <form action={action}>
          <input type="hidden" name="dealId" value={deal.id} />
          <input type="hidden" name="status" value="in_talks" />
          <Button size="sm" variant="ghost" type="submit" disabled={pending}>
            Reopen
          </Button>
        </form>
      ) : null}

      {/* Moving a deal to Payable is what puts money on the next transfer, so it
          shows the amount and who it belongs to before it commits. */}
      <ConfirmDialog
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="Mark this deal payable?"
        description="This puts it on the next transfer and tells the rep it is coming."
        confirmLabel="Yes, it is payable"
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ dealId: deal.id, status: 'closed' }}
      >
        <dl className="grid gap-2.5 rounded-[8px] border border-line bg-surface-2 px-4 py-3.5 text-[14px]">
          <Row label="Client" value={deal.clientName} />
          <Row label="Rep" value={deal.personName} />
          <Row
            label="Spiff"
            value={<span className="num text-volt">{fmtMoney(deal.spiffAmount, true)}</span>}
          />
          {deal.partnerComp > 0 ? (
            <Row
              label="Partner cut"
              value={<span className="num">{fmtMoney(deal.partnerComp, true)}</span>}
            />
          ) : null}
        </dl>
      </ConfirmDialog>

      <ConfirmDialog
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title={`Mark ${deal.clientName} lost?`}
        description="The reason shows on the deal, so “why was my referral killed?” always has an answer."
        confirmLabel="Mark it lost"
        destructive
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ dealId: deal.id, status: 'lost' }}
      >
        <label className="block">
          <span className="mb-1.5 block font-head text-[12px] tracking-[0.1em] text-muted uppercase">
            Why
          </span>
          <textarea
            name="lostReason"
            rows={3}
            required
            placeholder="Went with another agency, budget pulled, unresponsive…"
            className="w-full rounded-[8px] border border-line bg-surface-2 px-3 py-2.5 text-[15px] text-paper placeholder:text-muted/60"
          />
        </label>
      </ConfirmDialog>

      {state.error && !lostOpen && !closeOpen ? (
        <p role="alert" className="w-full text-right text-[12px] text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-head text-[11px] tracking-[0.12em] text-muted uppercase">{label}</dt>
      <dd className="text-right text-paper">{value}</dd>
    </div>
  )
}

/** The status pill, plus the age line the original showed under it. */
export function DealStatusCell({ deal }: { deal: DealRow }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Pill tone={deal.status} />
      {(deal.status === 'submitted' || deal.status === 'in_talks') && deal.ageDays >= 30 ? (
        <span className="text-[11.5px] text-warn">⚠ No movement in {deal.ageDays} days</span>
      ) : null}
      {deal.status === 'lost' && deal.lostReason ? (
        <span className="text-[11.5px] text-muted">{deal.lostReason}</span>
      ) : null}
      {DEAL_STATUS_LABEL[deal.status] === 'Paid' && deal.locked ? (
        <span className="text-[11.5px] text-muted">Settled</span>
      ) : null}
    </div>
  )
}
