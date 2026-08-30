'use client'

import { useEffect, useRef } from 'react'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Field, Notice, inputClass } from '@/components/ui'
import { submitDeal, type ActionState } from '@/lib/actions/deals'
import { SERVICE_OPTIONS } from '@/lib/types'
import { ServiceCheckboxes } from '../deals/service-checkboxes'

const initial: ActionState = {}

/** A rep sending in a referral. Client name is all that is required. */
export function SubmitDealForm() {
  const [state, action, pending] = useActionState(submitDeal, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok) formRef.current?.reset()
  }, [state.ok])

  return (
    <form ref={formRef} action={action} className="grid gap-4">
      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Field label="Client" hint="The only thing we really need to get started">
        <input className={inputClass} name="clientName" required maxLength={160} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Services" hint="Pick as many as apply">
          <ServiceCheckboxes options={SERVICE_OPTIONS} />
        </Field>
        <Field label="Contact">
          <input className={inputClass} name="contact" maxLength={120} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <Field label="City">
            <input className={inputClass} name="city" maxLength={80} />
          </Field>
        </div>
        <Field label="State">
          <input className={inputClass} name="state" maxLength={2} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <input className={inputClass} name="phone" type="tel" maxLength={40} />
        </Field>
        <Field label="Email">
          <input className={inputClass} name="email" type="email" maxLength={160} />
        </Field>
      </div>

      <Field label="Anything else">
        <textarea className={inputClass} name="note" rows={2} maxLength={500} />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Sending…' : 'Send it in'}
        </Button>
      </div>
    </form>
  )
}
