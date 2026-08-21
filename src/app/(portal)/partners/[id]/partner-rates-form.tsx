'use client'

import { useActionState, useState } from 'react'

import { Button, Field, Notice, inputClass } from '@/components/ui'
import { updatePartnerRates } from '@/lib/actions/partners'
import type { ActionState } from '@/lib/actions/deals'
import type { Partner } from '@/lib/types'

const initial: ActionState = {}

export function PartnerRatesForm({ partner }: { partner: Partner }) {
  const [state, action, pending] = useActionState(updatePartnerRates, initial)
  const [compMode, setCompMode] = useState(partner.compMode)

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="partnerId" value={partner.id} />

      <Field label="Default spiff" hint="What a rep's referral pays when they submit it.">
        <input
          name="defaultSpiff"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={partner.defaultSpiff}
          className={inputClass}
        />
      </Field>

      <Field label="Rev-share %" hint="Applied to the accruing monthly base each statement.">
        <input
          name="revsharePct"
          type="number"
          min={0}
          max={100}
          step="0.001"
          required
          defaultValue={partner.revsharePct}
          className={inputClass}
        />
      </Field>

      <Field label="Partner compensation">
        <select
          name="compMode"
          value={compMode}
          onChange={(e) => setCompMode(e.target.value as Partner['compMode'])}
          className={inputClass}
        >
          <option value="none">None</option>
          <option value="flat">Flat amount per close</option>
          <option value="pct">Percentage per close</option>
        </select>
      </Field>

      {compMode === 'flat' ? (
        <Field label="Flat amount">
          <input
            name="compFlat"
            type="number"
            min={0}
            step="0.01"
            defaultValue={partner.compFlat}
            className={inputClass}
          />
        </Field>
      ) : null}

      {compMode === 'pct' ? (
        <Field label="Percentage">
          <input
            name="compPct"
            type="number"
            min={0}
            max={100}
            step="0.001"
            defaultValue={partner.compPct}
            className={inputClass}
          />
        </Field>
      ) : null}

      {compMode !== 'none' ? (
        <Field label="Basis">
          <select name="compBasis" defaultValue={partner.compBasis} className={inputClass}>
            <option value="first_month">First month's value</option>
            <option value="contract">Full contract value</option>
          </select>
        </Field>
      ) : (
        <>
          <input type="hidden" name="compFlat" value={0} />
          <input type="hidden" name="compPct" value={0} />
          <input type="hidden" name="compBasis" value={partner.compBasis} />
        </>
      )}

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save rates'}
        </Button>
      </div>
    </form>
  )
}
