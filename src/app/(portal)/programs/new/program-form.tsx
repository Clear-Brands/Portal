'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'

import { Button, Field, Notice, cn, inputClass } from '@/components/ui'
import { createCompetition, createSprint } from '@/lib/actions/programs'
import type { ActionState } from '@/lib/actions/deals'
import type { TeamOption } from '@/lib/types'

const initial: ActionState = {}

export function ProgramForm({ teams }: { teams: TeamOption[] }) {
  const [kind, setKind] = useState<'competition' | 'sprint'>('competition')

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <TabButton active={kind === 'competition'} onClick={() => setKind('competition')}>
          Competition
        </TabButton>
        <TabButton active={kind === 'sprint'} onClick={() => setKind('sprint')}>
          Sprint
        </TabButton>
      </div>

      {kind === 'competition' ? <CompetitionForm teams={teams} /> : <SprintForm teams={teams} />}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-[8px] px-3.5 py-2 font-head text-[12.5px] tracking-[0.05em] uppercase',
        active ? 'bg-volt text-ink' : 'border border-line bg-transparent text-muted hover:text-paper',
      )}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Competition — individuals racing each other                                */
/* -------------------------------------------------------------------------- */

function CompetitionForm({ teams }: { teams: TeamOption[] }) {
  const [state, action, pending] = useActionState(createCompetition, initial)

  return (
    <form action={action} className="grid gap-5">
      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Field label="Name">
        <input className={inputClass} name="name" required maxLength={160} autoFocus />
      </Field>

      <Field label="Pod" hint="Leave as Everyone to run it partner-wide">
        <select className={inputClass} name="teamId" defaultValue="">
          <option value="">Everyone</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <input className={inputClass} name="startDate" type="date" required />
        </Field>
        <Field label="Ends">
          <input className={inputClass} name="endDate" type="date" required />
        </Field>
      </div>

      <Field label="Minimum closes to qualify" hint="At least 1 — reps below the bar still appear on the board, with no prize attached">
        <input className={inputClass} name="minCloses" type="number" min={1} step={1} defaultValue={1} required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="1st prize">
          <input className={inputClass} name="prize1" maxLength={160} placeholder="Rolex Submariner" />
        </Field>
        <Field label="2nd prize">
          <input className={inputClass} name="prize2" maxLength={160} placeholder="$500" />
        </Field>
        <Field label="3rd prize">
          <input className={inputClass} name="prize3" maxLength={160} placeholder="$250" />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 text-[13.5px] text-paper">
        <input type="checkbox" name="visible" defaultChecked className="h-4 w-4" />
        Visible to members as soon as it&rsquo;s created
      </label>

      <FormActions pending={pending} label="Add competition" />
    </form>
  )
}

/* -------------------------------------------------------------------------- */
/* Sprint — pods racing each other                                            */
/* -------------------------------------------------------------------------- */

function SprintForm({ teams }: { teams: TeamOption[] }) {
  const [state, action, pending] = useActionState(createSprint, initial)
  const [sprintType, setSprintType] = useState<'winner' | 'perteam'>('winner')
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])

  const selectedTeams = useMemo(
    () => teams.filter((t) => selectedTeamIds.includes(t.id)),
    [teams, selectedTeamIds],
  )

  function toggleTeam(id: string) {
    setSelectedTeamIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  return (
    <form action={action} className="grid gap-5">
      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <Field label="Name">
        <input className={inputClass} name="name" required maxLength={160} autoFocus />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <input className={inputClass} name="startDate" type="date" required />
        </Field>
        <Field label="Ends">
          <input className={inputClass} name="endDate" type="date" required />
        </Field>
      </div>

      <Field label="Pods racing" hint="Pick at least two — a sprint is pod against pod">
        <div className="grid gap-1.5 rounded-[8px] border border-line bg-surface-2 p-2.5">
          {teams.map((t) => (
            <label key={t.id} className="flex items-center gap-2.5 px-1.5 py-1 text-[13.5px] text-paper">
              <input
                type="checkbox"
                name="teamIds"
                value={t.id}
                checked={selectedTeamIds.includes(t.id)}
                onChange={() => toggleTeam(t.id)}
                className="h-4 w-4"
              />
              <span aria-hidden className="h-2 w-2 flex-none rounded-[2px]" style={{ background: t.color }} />
              {t.name}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Prize structure">
        <select
          className={inputClass}
          name="sprintType"
          value={sprintType}
          onChange={(e) => setSprintType(e.target.value as 'winner' | 'perteam')}
        >
          <option value="winner">One ladder for the whole sprint</option>
          <option value="perteam">A separate prize ladder per pod</option>
        </select>
      </Field>

      {sprintType === 'winner' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="1st pod prize">
              <input className={inputClass} name="prizeTeam1" maxLength={160} />
            </Field>
            <Field label="2nd pod prize">
              <input className={inputClass} name="prizeTeam2" maxLength={160} />
            </Field>
            <Field label="3rd pod prize">
              <input className={inputClass} name="prizeTeam3" maxLength={160} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="1st rep prize">
              <input className={inputClass} name="prizeRep1" maxLength={160} />
            </Field>
            <Field label="2nd rep prize">
              <input className={inputClass} name="prizeRep2" maxLength={160} />
            </Field>
            <Field label="3rd rep prize">
              <input className={inputClass} name="prizeRep3" maxLength={160} />
            </Field>
          </div>
          <Field label="Winning pod's manager">
            <input className={inputClass} name="prizeManager" maxLength={160} placeholder="$300 bonus" />
          </Field>
        </>
      ) : (
        <div className="grid gap-4">
          {selectedTeams.length === 0 ? (
            <p className="text-[13px] text-muted">Pick pods above to set a prize ladder for each.</p>
          ) : null}
          {selectedTeams.map((t) => (
            <div key={t.id} className="rounded-[8px] border border-line bg-surface-2 p-3.5">
              <p className="mb-2.5 flex items-center gap-2 font-head text-[12px] tracking-[0.1em] text-paper uppercase">
                <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ background: t.color }} />
                {t.name}
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="1st">
                  <input className={inputClass} name={`teamPrize.${t.id}.c1`} maxLength={160} />
                </Field>
                <Field label="2nd">
                  <input className={inputClass} name={`teamPrize.${t.id}.c2`} maxLength={160} />
                </Field>
                <Field label="3rd">
                  <input className={inputClass} name={`teamPrize.${t.id}.c3`} maxLength={160} />
                </Field>
                <Field label="Manager">
                  <input className={inputClass} name={`teamPrize.${t.id}.mgr`} maxLength={160} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2.5 text-[13.5px] text-paper">
        <input type="checkbox" name="visible" defaultChecked className="h-4 w-4" />
        Visible to members as soon as it&rsquo;s created
      </label>

      <FormActions pending={pending} label="Add sprint" />
    </form>
  )
}

function FormActions({ pending, label }: { pending: boolean; label: string }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : label}
      </Button>
      <Button variant="ghost" type="button">
        <Link href="/programs">Back to programs</Link>
      </Button>
    </div>
  )
}
