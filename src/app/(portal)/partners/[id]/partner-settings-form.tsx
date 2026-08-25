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
