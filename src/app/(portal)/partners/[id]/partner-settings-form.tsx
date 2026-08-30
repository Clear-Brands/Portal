'use client'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Field, Notice, inputClass } from '@/components/ui'
import { updatePartnerProfile } from '@/lib/actions/partners'
import type { ActionState } from '@/lib/actions/deals'
import type { Partner } from '@/lib/types'

const initial: ActionState = {}

const FEATURES: { key: keyof Partner; name: string; label: string }[] = [
  { key: 'dealsEnabled', name: 'dealsEnabled', label: 'Deals' },
  { key: 'spiffsEnabled', name: 'spiffsEnabled', label: 'Spiffs' },
  { key: 'revshareEnabled', name: 'revshareEnabled', label: 'Rev share' },
  { key: 'competitionsEnabled', name: 'competitionsEnabled', label: 'Competitions & sprints' },
  { key: 'annualEnabled', name: 'annualEnabled', label: 'Closers Club' },
]

const SELF_SERVE: { key: keyof Partner; name: string; label: string; hint: string } = {
  key: 'selfServeDealsEnabled',
  name: 'selfServeDealsEnabled',
  label: 'Reps can submit a deal manually',
  hint: 'Off means only Clear Brands can add deals for this partner — the booking-link automation still logs deals on its own either way.',
}

export function PartnerSettingsForm({ partner }: { partner: Partner }) {
  const [state, action, pending] = useActionState(updatePartnerProfile, initial)

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="partnerId" value={partner.id} />

      <Field label="Name">
        <input name="name" required defaultValue={partner.name} className={inputClass} />
      </Field>

      <Field
        label="Timezone"
        hint="An IANA name. Every 'today' for this partner — deal windows, rev-share periods — resolves here."
      >
        <input name="timezone" required defaultValue={partner.timezone} className={inputClass} />
      </Field>

      <Field label="Brand accent">
        <input
          name="brandAccent"
          required
          defaultValue={partner.brandAccent}
          placeholder="#C8F52F"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-2 border-t border-line pt-4">
        <p className="font-head text-[11px] tracking-[0.15em] text-muted uppercase">
          Feature toggles
        </p>
        {FEATURES.map((f) => (
          <label key={f.key} className="flex items-center gap-2.5 text-[13.5px] text-paper">
            <input type="checkbox" name={f.name} defaultChecked={Boolean(partner[f.key])} />
            {f.label}
          </label>
        ))}

        <div className="mt-1 border-t border-line pt-3">
          <label className="flex items-center gap-2.5 text-[13.5px] text-paper">
            <input
              type="checkbox"
              name={SELF_SERVE.name}
              defaultChecked={Boolean(partner[SELF_SERVE.key])}
            />
            {SELF_SERVE.label}
          </label>
          <p className="mt-1 pl-[26px] text-[12px] text-muted">{SELF_SERVE.hint}</p>
        </div>
      </div>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}
