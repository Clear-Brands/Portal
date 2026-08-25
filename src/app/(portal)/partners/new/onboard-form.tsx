'use client'

import { useState } from 'react'
import Link from 'next/link'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Field, Notice, inputClass } from '@/components/ui'
import { onboardPartner, type OnboardState } from '@/lib/actions/partners'

const initial: OnboardState = {}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function OnboardForm() {
  const [state, action, pending] = useActionState(onboardPartner, initial)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  return (
    <form action={action} className="grid gap-4">
      <Field label="Partner name">
        <input
          name="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (!slugTouched) setSlug(slugify(e.target.value))
          }}
          placeholder="Summit Field Services"
          className={inputClass}
        />
      </Field>

      <Field label="Slug" hint="Lowercase letters, numbers and dashes. Used in a few internal links, never shown to the partner.">
        <input
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(slugify(e.target.value))
          }}
          className={inputClass}
        />
      </Field>

      <Field label="Timezone" hint="An IANA name — e.g. America/New_York, America/Chicago, America/Los_Angeles. Every 'today' for this partner resolves here.">
        <input name="timezone" defaultValue="America/New_York" className={inputClass} />
      </Field>

      <Field label="Default spiff" hint="Applied automatically to every referral a rep submits.">
        <input
          name="defaultSpiff"
          type="number"
          min={0}
          step="0.01"
          defaultValue={250}
          className={inputClass}
        />
      </Field>

      <Field label="First pod">
        <input name="podName" required placeholder="Sales" className={inputClass} />
      </Field>

      <div className="grid gap-4 border-t border-line pt-4">
        <p className="font-head text-[11px] tracking-[0.15em] text-muted uppercase">Admin login</p>
        <Field label="Name">
          <input name="adminName" required className={inputClass} />
        </Field>
        <Field label="Email">
          <input name="adminEmail" type="email" required className={inputClass} />
        </Field>
      </div>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.ok ? (
        <Notice tone="success">
          {state.ok}{' '}
          {state.partnerId ? (
            <Link href={`/partners/${state.partnerId}`} className="underline underline-offset-4">
              View the partner
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Onboarding…' : 'Onboard partner'}
        </Button>
      </div>
    </form>
  )
}
