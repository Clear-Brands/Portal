'use client'

import { useState } from 'react'

import { inputClass } from '@/components/ui'

/**
 * Multi-select services, shared by every place a deal's services are picked:
 * adding a deal (internal), submitting a referral (rep), and editing one.
 *
 * Every box shares the name "services" — FormData carries repeated fields as
 * multiple entries under one key, which is exactly what the server actions'
 * `parseServices()` reads with `getAll('services')`. An "Other" box lets
 * someone add a service outside the fixed list without it silently vanishing
 * on save.
 */
export function ServiceCheckboxes({
  options,
  defaultSelected = [],
}: {
  options: readonly string[]
  defaultSelected?: string[]
}) {
  const known = new Set(options as string[])
  const [otherValue, setOtherValue] = useState(
    defaultSelected.find((s) => !known.has(s)) ?? '',
  )
  const [otherOn, setOtherOn] = useState(Boolean(otherValue))

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-1.5 text-[13.5px] text-paper">
            <input
              type="checkbox"
              name="services"
              value={opt}
              defaultChecked={defaultSelected.includes(opt)}
            />
            {opt}
          </label>
        ))}
        <label className="flex items-center gap-1.5 text-[13.5px] text-paper">
          <input
            type="checkbox"
            checked={otherOn}
            onChange={(e) => setOtherOn(e.target.checked)}
          />
          Other
        </label>
      </div>

      {otherOn ? (
        <input
          className={inputClass}
          name="services"
          maxLength={80}
          placeholder="Name the service"
          value={otherValue}
          onChange={(e) => setOtherValue(e.target.value)}
        />
      ) : null}
    </div>
  )
}
