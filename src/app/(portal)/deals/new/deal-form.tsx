'use client'

import Link from 'next/link'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Field, Notice, inputClass } from '@/components/ui'
import { addDeal, type ActionState } from '@/lib/actions/deals'
import type { PersonOption } from '@/lib/types'
import { PersonPicker } from './person-picker'

const initial: ActionState = {}

export function DealForm({
  people,
  defaultSpiff,
  canPrice,
  showDealValue,
  showMonthlyValue,
}: {
  people: PersonOption[]
  defaultSpiff: number
  canPrice: boolean
  showDealValue: boolean
  showMonthlyValue: boolean
}) {
  const [state, action, pending] = useActionState(addDeal, initial)

  return (
    <form action={action} className="grid gap-5">
      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Field label="Client">
        <input className={inputClass} name="clientName" required maxLength={160} autoFocus />
      </Field>

      <Field label="Rep">
        <PersonPicker initial={people} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service">
          <input className={inputClass} name="service" list="services" maxLength={80} />
          <datalist id="services">
            <option value="SEO" />
            <option value="Paid Ads" />
            <option value="Web Design" />
            <option value="LSA" />
          </datalist>
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
          <input className={inputClass} name="state" maxLength={2} placeholder="FL" />
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

      {/* The spiff field only appears for people who may set rates. For everyone
          else the server uses the partner's configured rate and ignores anything
          the form might have carried. */}
      {canPrice ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Spiff" hint={`Partner default is $${defaultSpiff}`}>
            <input
              className={inputClass}
              name="spiffAmount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={defaultSpiff}
            />
          </Field>
          {showDealValue ? (
            <Field label="Deal value" hint="Used to work out the partner's percentage cut">
              <input className={inputClass} name="dealValue" type="number" min={0} step="0.01" />
            </Field>
          ) : null}
          {showMonthlyValue ? (
            <Field
              label="Monthly value"
              hint="What this client pays per month — the base for the partner's ongoing rev-share cut"
            >
              <input className={inputClass} name="monthlyValue" type="number" min={0} step="0.01" />
            </Field>
          ) : null}
        </div>
      ) : (
        <Notice tone="info">
          This referral will carry the partner&rsquo;s standard spiff of ${defaultSpiff}.
        </Notice>
      )}

      <Field label="Note">
        <textarea className={inputClass} name="promoNote" rows={2} maxLength={500} />
      </Field>

      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add deal'}
        </Button>
        <Button variant="ghost" type="button">
          <Link href={'/deals'}>Back to deals</Link>
        </Button>
      </div>
    </form>
  )
}
