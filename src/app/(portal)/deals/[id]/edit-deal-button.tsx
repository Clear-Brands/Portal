'use client'

import { useState } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { useCloseOnSuccess } from '@/lib/use-close-on-success'
import { Button, Field, inputClass } from '@/components/ui'
import { ConfirmDialog } from '@/components/dialog'
import { editDeal, type ActionState } from '@/lib/actions/deals'
import { SERVICE_OPTIONS } from '@/lib/types'
import { ServiceCheckboxes } from '../service-checkboxes'
import type { DealRow } from '@/lib/data/deals'

const initial: ActionState = {}

/**
 * Edit a deal's client details in place, from its own page.
 *
 * This is the piece "click into a deal and edit" was still missing —
 * transitions (status, lost reason) already had DealActions; nothing let you
 * fix a typo'd client name or add a service after the fact. Deliberately
 * does not touch money (spiff, deal value) or the rep — those already have
 * their own dedicated, more carefully gated actions.
 */
export function EditDealButton({ deal }: { deal: DealRow }) {
  const [state, action, pending] = useActionState(editDeal, initial)
  const [open, setOpen] = useState(false)

  useCloseOnSuccess(state.ok, setOpen)

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Edit details
      </Button>

      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Edit ${deal.clientName}`}
        confirmLabel="Save"
        pending={pending}
        error={state.error}
        formAction={action}
        hiddenFields={{ dealId: deal.id }}
      >
        <div className="grid gap-3.5">
          <Field label="Client">
            <input
              className={inputClass}
              name="clientName"
              required
              maxLength={160}
              defaultValue={deal.clientName}
            />
          </Field>

          <Field label="Services" hint="Pick as many as apply">
            <ServiceCheckboxes options={SERVICE_OPTIONS} defaultSelected={deal.services} />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Field label="City">
                <input className={inputClass} name="city" maxLength={80} defaultValue={deal.city} />
              </Field>
            </div>
            <Field label="State">
              <input className={inputClass} name="state" maxLength={2} defaultValue={deal.state} />
            </Field>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Contact">
              <input className={inputClass} name="contact" maxLength={120} defaultValue={deal.contact} />
            </Field>
            <Field label="Phone">
              <input className={inputClass} name="phone" type="tel" maxLength={40} defaultValue={deal.phone} />
            </Field>
          </div>

          <Field label="Email">
            <input className={inputClass} name="email" type="email" maxLength={160} defaultValue={deal.email} />
          </Field>

          <Field label="Note">
            <textarea
              className={inputClass}
              name="promoNote"
              rows={2}
              maxLength={500}
              defaultValue={deal.promoNote}
            />
          </Field>
        </div>
      </ConfirmDialog>
    </>
  )
}
