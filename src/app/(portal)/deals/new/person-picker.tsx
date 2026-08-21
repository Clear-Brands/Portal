'use client'

import { useEffect, useState } from 'react'

import { cn, inputClass } from '@/components/ui'
import type { PersonOption } from '@/lib/types'

/**
 * A searchable rep picker.
 *
 * Fetches matches as you type instead of shipping the whole roster into the
 * page. At 500 people the difference is a list that stays usable.
 */
export function PersonPicker({ initial }: { initial: PersonOption[] }) {
  const [term, setTerm] = useState('')
  const [options, setOptions] = useState<PersonOption[]>(initial)
  const [selected, setSelected] = useState<PersonOption | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/people?q=${encodeURIComponent(term)}`)
      if (response.ok) setOptions((await response.json()) as PersonOption[])
    }, 250)
    return () => clearTimeout(timer)
  }, [term, open])

  return (
    <div className="relative">
      <input type="hidden" name="personId" value={selected?.id ?? ''} required />

      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="person-listbox"
        autoComplete="off"
        className={inputClass}
        placeholder="Start typing a name…"
        value={selected && !open ? selected.name : term}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setTerm(e.target.value)
          setSelected(null)
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />

      {open ? (
        <ul
          id="person-listbox"
          role="listbox"
          className="absolute z-20 mt-1 max-h-[260px] w-full overflow-y-auto rounded-[10px] border border-line bg-surface-2 py-1 shadow-2xl"
        >
          {options.length === 0 ? (
            <li className="px-3.5 py-2.5 text-[13.5px] text-muted">
              Nobody matches “{term}”. Check the roster.
            </li>
          ) : (
            options.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected?.id === person.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelected(person)
                    setTerm('')
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-baseline justify-between gap-3 px-3.5 py-2 text-left text-[14px]',
                    selected?.id === person.id ? 'bg-volt-dim text-volt' : 'text-paper hover:bg-white/5',
                  )}
                >
                  <span>{person.name}</span>
                  {person.teamName ? (
                    <span className="text-[12px] text-muted">{person.teamName}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
