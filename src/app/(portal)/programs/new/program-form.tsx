'use client'

import { useState } from 'react'
import Link from 'next/link'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Field, Notice, cn, inputClass } from '@/components/ui'
import { createAnnualGoal, createCompetition, createSprint } from '@/lib/actions/programs'
import type { ActionState } from '@/lib/actions/deals'
import type { TeamOption } from '@/lib/types'

const initial: ActionState = {}

export function ProgramForm({ teams }: { teams: TeamOption[] }) {
  const [kind, setKind] = useState<'competition' | 'sprint' | 'closers_club'>('competition')

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <TabButton active={kind === 'competition'} onClick={() => setKind('competition')}>
          Competition
        </TabButton>
        <TabButton active={kind === 'sprint'} onClick={() => setKind('sprint')}>
          Sprint
        </TabButton>
        <TabButton active={kind === 'closers_club'} onClick={() => setKind('closers_club')}>
          Closers Club
        </TabButton>
      </div>

      {kind === 'competition' ? (
        <CompetitionForm teams={teams} />
      ) : kind === 'sprint' ? (
        <SprintForm teams={teams} />
      ) : (
        <ClosersClubForm teams={teams} />
      )}
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

      <Field label="Pod" hint="Leave as Everyone to run it across every pod for this partner — not any other partner">
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

/** The four per-pod slots — tiered by pod finish, a rep-place row or the
 *  manager row, each with three prize values (winning / 2nd / 3rd pod). */
type TieredSlotKey = 'podRep1' | 'podRep2' | 'podRep3' | 'podManager'

const TIERED_SLOT_FIELD_NAMES: Record<TieredSlotKey, { enabledName: string; prizeName: string }> = {
  podRep1: { enabledName: 'podRep1Enabled', prizeName: 'podRep1Prize' },
  podRep2: { enabledName: 'podRep2Enabled', prizeName: 'podRep2Prize' },
  podRep3: { enabledName: 'podRep3Enabled', prizeName: 'podRep3Prize' },
  podManager: { enabledName: 'podManagerEnabled', prizeName: 'podManagerPrize' },
}

/** The two cross-pod slots — a single winner, so a single toggle + prize text. */
type SingleSlotKey = 'topRepTopPod' | 'topPodManager'

const SINGLE_SLOT_FIELD_NAMES: Record<SingleSlotKey, { enabledName: string; prizeName: string }> = {
  topRepTopPod: { enabledName: 'topRepTopPodEnabled', prizeName: 'topRepTopPodPrize' },
  topPodManager: { enabledName: 'topPodManagerEnabled', prizeName: 'topPodManagerPrize' },
}

type SlotKey = TieredSlotKey | SingleSlotKey

function SprintForm({ teams }: { teams: TeamOption[] }) {
  const [state, action, pending] = useActionState(createSprint, initial)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])
  const [slots, setSlots] = useState<Record<SlotKey, boolean>>({
    podRep1: false,
    podRep2: false,
    podRep3: false,
    podManager: false,
    topRepTopPod: false,
    topPodManager: false,
  })

  function toggleTeam(id: string) {
    setSelectedTeamIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  /** Turning a tier off cascades to the tiers below it, and the toggle for a
   *  lower tier is disabled until the one above it is on — the same
   *  top-down rule `sprints_rep_tiers_top_down` enforces in the database. */
  function setSlot(key: SlotKey, value: boolean) {
    setSlots((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'podRep1' && !value) next.podRep2 = false
      if ((key === 'podRep1' || key === 'podRep2') && !value) next.podRep3 = false
      return next
    })
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
        <Field label="Ends" hint="A target, not a cutoff — standings keep moving until you close the sprint">
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

      <div className="grid gap-3">
        <p className="font-head text-[11px] tracking-[0.12em] text-muted uppercase">Prizes</p>
        <p className="text-[12px] text-muted">
          Toggle on whichever of these a sprint pays out — everything else stays off. Pod rep
          tiers and the pod manager prize pay in every pod, but the amount depends on where that
          pod finishes overall — enter the same value in all three columns for a flat prize
          instead. Top rep/top pod and Top pod manager each pay exactly one winner, from the
          #1-ranked pod only, so there&rsquo;s nothing to tier.
        </p>

        <TieredSlotRow
          slotKey="podRep1"
          label="1st-place pod rep"
          hint="Every pod's own top rep"
          enabled={slots.podRep1}
          onToggle={(v) => setSlot('podRep1', v)}
        />
        <TieredSlotRow
          slotKey="podRep2"
          label="2nd-place pod rep"
          hint="Every pod's own #2 rep"
          enabled={slots.podRep2}
          onToggle={(v) => setSlot('podRep2', v)}
          disabled={!slots.podRep1}
        />
        <TieredSlotRow
          slotKey="podRep3"
          label="3rd-place pod rep"
          hint="Every pod's own #3 rep"
          enabled={slots.podRep3}
          onToggle={(v) => setSlot('podRep3', v)}
          disabled={!slots.podRep2}
        />
        <TieredSlotRow
          slotKey="podManager"
          label="Pod manager"
          hint="Pays every pod's manager(s) — not just the winner"
          enabled={slots.podManager}
          onToggle={(v) => setSlot('podManager', v)}
        />
        <SlotRow
          slotKey="topRepTopPod"
          label="Top rep, top pod"
          hint="One winner — the top rep on the #1-ranked pod"
          enabled={slots.topRepTopPod}
          onToggle={(v) => setSlot('topRepTopPod', v)}
        />
        <SlotRow
          slotKey="topPodManager"
          label="Top pod manager"
          hint="One winner — the #1-ranked pod's manager(s) only"
          enabled={slots.topPodManager}
          onToggle={(v) => setSlot('topPodManager', v)}
        />
      </div>

      <label className="flex items-center gap-2.5 text-[13.5px] text-paper">
        <input type="checkbox" name="visible" defaultChecked className="h-4 w-4" />
        Visible to members as soon as it&rsquo;s created
      </label>

      <FormActions pending={pending} label="Add sprint" />
    </form>
  )
}

/** The two cross-pod slots — a single toggle + a single prize text, since
 *  they only ever pay one winner from the #1-ranked pod. */
function SlotRow({
  slotKey,
  label,
  hint,
  enabled,
  onToggle,
}: {
  slotKey: SingleSlotKey
  label: string
  hint: string
  enabled: boolean
  onToggle: (value: boolean) => void
}) {
  const { enabledName, prizeName } = SINGLE_SLOT_FIELD_NAMES[slotKey]

  return (
    <div className="grid gap-2.5 rounded-[8px] border border-line bg-surface-2 p-3 sm:grid-cols-[220px_1fr] sm:items-center">
      <label className="flex items-center gap-2.5 text-[13.5px] text-paper">
        <input
          type="checkbox"
          name={enabledName}
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4"
        />
        <span>
          {label}
          <span className="mt-0.5 block text-[11.5px] text-muted">{hint}</span>
        </span>
      </label>
      <input
        className={inputClass}
        name={prizeName}
        maxLength={160}
        placeholder="$500, a trip, a watch…"
        disabled={!enabled}
        required={enabled}
      />
    </div>
  )
}

/** One of the four per-pod slots — an enable toggle plus a 3-column grid of
 *  prize inputs, one per pod-finish tier (winning / 2nd / 3rd place pod). */
function TieredSlotRow({
  slotKey,
  label,
  hint,
  enabled,
  onToggle,
  disabled = false,
}: {
  slotKey: TieredSlotKey
  label: string
  hint: string
  enabled: boolean
  onToggle: (value: boolean) => void
  disabled?: boolean
}) {
  const { enabledName, prizeName } = TIERED_SLOT_FIELD_NAMES[slotKey]

  return (
    <div
      className={cn('grid gap-3 rounded-[8px] border border-line bg-surface-2 p-3', disabled && 'opacity-50')}
    >
      <label className="flex items-center gap-2.5 text-[13.5px] text-paper">
        <input
          type="checkbox"
          name={enabledName}
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4"
        />
        <span>
          {label}
          <span className="mt-0.5 block text-[11.5px] text-muted">{hint}</span>
        </span>
      </label>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <TierInput label="Winning pod" name={`${prizeName}.pod1st`} enabled={enabled} />
        <TierInput label="2nd place pod" name={`${prizeName}.pod2nd`} enabled={enabled} />
        <TierInput label="3rd place pod" name={`${prizeName}.pod3rd`} enabled={enabled} />
      </div>
    </div>
  )
}

function TierInput({ label, name, enabled }: { label: string; name: string; enabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] text-muted">{label}</span>
      <input
        className={inputClass}
        name={name}
        maxLength={160}
        placeholder="$500, a trip, a watch…"
        disabled={!enabled}
        required={enabled}
      />
    </label>
  )
}

/* -------------------------------------------------------------------------- */
/* Closers Club — hit a close count in a window, one running at a time         */
/* -------------------------------------------------------------------------- */

function ClosersClubForm({ teams }: { teams: TeamOption[] }) {
  const [state, action, pending] = useActionState(createAnnualGoal, initial)
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])

  function toggleTeam(id: string) {
    setSelectedTeamIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  return (
    <form action={action} className="grid gap-5">
      {state.ok ? <Notice tone="success">{state.ok}</Notice> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}

      <p className="text-[13px] text-muted">
        Everybody feels included in the company — the same target and prize can span one pod or
        several. Only one Closers Club competition can run at a time for this partner; starting
        one while another&rsquo;s dates overlap will be refused.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <input className={inputClass} name="startDate" type="date" required />
        </Field>
        <Field label="Ends">
          <input className={inputClass} name="endDate" type="date" required />
        </Field>
      </div>

      <Field label="Pods" hint="Leave all unchecked to run it across every pod">
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

      <Field label="Target closes" hint="How many closes wins the prize">
        <input className={inputClass} name="target" type="number" min={1} step={1} required />
      </Field>

      <Field label="Prize" hint="Optional — cash, a watch, anything">
        <input className={inputClass} name="prize" maxLength={160} placeholder="$500, a trip, a watch…" />
      </Field>

      <FormActions pending={pending} label="Start Closers Club" />
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
