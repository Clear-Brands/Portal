'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner, partnerToday } from '@/lib/partner-context'
import { requireSession } from '@/lib/session'
import { can } from '@/lib/auth/capabilities'
import type { ActionState } from '@/lib/actions/deals'

/**
 * Programme mutations.
 *
 * Every insert here goes to a table with `for all` row-level security in
 * 0008_rls.sql gating the same capability checked below — `programs.write` for
 * competitions, sprints and goals, `payouts.write` for approving a goal award,
 * because that is the one write in this file that commits money. Neither policy
 * nor action trusts the other alone; ground rule 2.
 */

/* -------------------------------------------------------------------------- */
/* Competitions                                                                */
/* -------------------------------------------------------------------------- */

const CompetitionSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the competition a name').max(160),
    teamId: z.string().trim().optional().default(''),
    startDate: z.iso.date('Enter a valid start date'),
    endDate: z.iso.date('Enter a valid end date'),
    minCloses: z.coerce.number().int('Whole closes only').min(1, 'At least one close is required to qualify'),
    prize1: z.string().trim().max(160).optional().default(''),
    prize2: z.string().trim().max(160).optional().default(''),
    prize3: z.string().trim().max(160).optional().default(''),
    visible: z.string().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  })

export async function createCompetition(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'programs.write')) {
    return { error: 'Creating a competition needs programme permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const parsed = CompetitionSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const input = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('competitions').insert({
    partner_id: partner.id,
    team_id: input.teamId || null,
    name: input.name,
    start_date: input.startDate,
    end_date: input.endDate,
    min_closes: input.minCloses,
    prize_1: input.prize1,
    prize_2: input.prize2,
    prize_3: input.prize3,
    visible: input.visible === 'on',
    created_by: profile.id,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/programs')
  return { ok: `${input.name} created.` }
}

/* -------------------------------------------------------------------------- */
/* Sprints                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Six independent prize slots, each a plain on/off toggle plus its own prize
 * text — no sprint "type" to pick anymore. Cristian's doc: "build prizes as
 * a per-sprint settings screen where the admin toggles each slot on or off."
 *
 *   podRep1/2/3   — per-pod rep tiers, same prize text in every pod. Top-down
 *                   only: 2 needs 1 on, 3 needs 2 on (mirrors the DB check
 *                   `sprints_rep_tiers_top_down` — enforced here too so the
 *                   form never round-trips to the server to find out).
 *   podManager    — pays every pod's manager(s), unconditionally.
 *   topRepTopPod  — one prize, to the top rep on the #1-ranked pod.
 *   topPodManager — one prize, to the #1-ranked pod's manager(s) only.
 */
const SprintSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the sprint a name').max(160),
    startDate: z.iso.date('Enter a valid start date'),
    endDate: z.iso.date('Enter a valid end date'),
    teamIds: z.array(z.guid()).min(2, 'A sprint needs at least two pods'),
    podRep1Enabled: z.string().optional(),
    podRep1Prize: z.string().trim().max(160).optional().default(''),
    podRep2Enabled: z.string().optional(),
    podRep2Prize: z.string().trim().max(160).optional().default(''),
    podRep3Enabled: z.string().optional(),
    podRep3Prize: z.string().trim().max(160).optional().default(''),
    podManagerEnabled: z.string().optional(),
    podManagerPrize: z.string().trim().max(160).optional().default(''),
    topRepTopPodEnabled: z.string().optional(),
    topRepTopPodPrize: z.string().trim().max(160).optional().default(''),
    topPodManagerEnabled: z.string().optional(),
    topPodManagerPrize: z.string().trim().max(160).optional().default(''),
    visible: z.string().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  })
  .refine((d) => d.podRep2Enabled !== 'on' || d.podRep1Enabled === 'on', {
    message: 'Turn on the 1st-place pod rep prize before the 2nd',
    path: ['podRep2Enabled'],
  })
  .refine((d) => d.podRep3Enabled !== 'on' || d.podRep2Enabled === 'on', {
    message: 'Turn on the 2nd-place pod rep prize before the 3rd',
    path: ['podRep3Enabled'],
  })
  .refine((d) => d.podRep1Enabled !== 'on' || d.podRep1Prize !== '', {
    message: 'Give the 1st-place pod rep prize a description',
    path: ['podRep1Prize'],
  })
  .refine((d) => d.podRep2Enabled !== 'on' || d.podRep2Prize !== '', {
    message: 'Give the 2nd-place pod rep prize a description',
    path: ['podRep2Prize'],
  })
  .refine((d) => d.podRep3Enabled !== 'on' || d.podRep3Prize !== '', {
    message: 'Give the 3rd-place pod rep prize a description',
    path: ['podRep3Prize'],
  })
  .refine((d) => d.podManagerEnabled !== 'on' || d.podManagerPrize !== '', {
    message: 'Give the pod manager prize a description',
    path: ['podManagerPrize'],
  })
  .refine((d) => d.topRepTopPodEnabled !== 'on' || d.topRepTopPodPrize !== '', {
    message: 'Give the top rep, top pod prize a description',
    path: ['topRepTopPodPrize'],
  })
  .refine((d) => d.topPodManagerEnabled !== 'on' || d.topPodManagerPrize !== '', {
    message: 'Give the top pod manager prize a description',
    path: ['topPodManagerPrize'],
  })

export async function createSprint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'programs.write')) {
    return { error: 'Creating a sprint needs programme permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const raw = Object.fromEntries(formData)
  const teamIds = formData.getAll('teamIds').map(String)

  const parsed = SprintSchema.safeParse({ ...raw, teamIds })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const input = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('sprints').insert({
    partner_id: partner.id,
    name: input.name,
    start_date: input.startDate,
    end_date: input.endDate,
    team_ids: input.teamIds,
    pod_rep_1_enabled: input.podRep1Enabled === 'on',
    pod_rep_1_prize: input.podRep1Prize,
    pod_rep_2_enabled: input.podRep2Enabled === 'on',
    pod_rep_2_prize: input.podRep2Prize,
    pod_rep_3_enabled: input.podRep3Enabled === 'on',
    pod_rep_3_prize: input.podRep3Prize,
    pod_manager_enabled: input.podManagerEnabled === 'on',
    pod_manager_prize: input.podManagerPrize,
    top_rep_top_pod_enabled: input.topRepTopPodEnabled === 'on',
    top_rep_top_pod_prize: input.topRepTopPodPrize,
    top_pod_manager_enabled: input.topPodManagerEnabled === 'on',
    top_pod_manager_prize: input.topPodManagerPrize,
    visible: input.visible === 'on',
    created_by: profile.id,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/programs')
  return { ok: `${input.name} created.` }
}

/* -------------------------------------------------------------------------- */
/* Close / reopen — the manual freeze. A sprint's end date is a target, not   */
/* an auto-cutoff (Cristian's doc: standings keep moving until someone closes */
/* it); these two just call the RPCs that do the actual snapshot/undo work.   */
/* -------------------------------------------------------------------------- */

const SprintIdSchema = z.object({ sprintId: z.guid() })

export async function closeSprint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'programs.write')) {
    return { error: 'Closing a sprint needs programme permissions.' }
  }

  const parsed = SprintIdSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Something is missing there — try again.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('close_sprint', { p_sprint_id: parsed.data.sprintId })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/programs')
  return { ok: 'Sprint closed — standings are now final.' }
}

export async function reopenSprint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'programs.write')) {
    return { error: 'Reopening a sprint needs programme permissions.' }
  }

  const parsed = SprintIdSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Something is missing there — try again.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reopen_sprint', { p_sprint_id: parsed.data.sprintId })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/programs')
  return { ok: 'Sprint reopened — standings are live again.' }
}

/* -------------------------------------------------------------------------- */
/* Closers Club (annual_goals) — hit a close count in a window, win the prize. */
/*                                                                              */
/* There was no create path for this before: the table and its standings view */
/* already existed, but nothing in the UI could insert a row — Cristian's      */
/* exact complaint on the Loom walkthrough ("I don't see anything in here to   */
/* make anyone"). team_ids (0015) lets one competition span several pods, the  */
/* way sprints already do; the exclusion constraint 0015 adds on annual_goals  */
/* is what actually enforces "only one running at a time" for the partner —   */
/* this action just turns that constraint violation into a readable error.    */
/* -------------------------------------------------------------------------- */

const AnnualGoalSchema = z
  .object({
    teamIds: z.array(z.guid()).optional().default([]),
    startDate: z.iso.date('Enter a valid start date'),
    endDate: z.iso.date('Enter a valid end date'),
    target: z.coerce.number().int('Whole closes only').min(1, 'At least one close is required'),
    prize: z.string().trim().max(160).optional().default(''),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  })

export async function createAnnualGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'programs.write')) {
    return { error: 'Starting a Closers Club competition needs programme permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const teamIds = formData.getAll('teamIds').map(String)
  const parsed = AnnualGoalSchema.safeParse({ ...Object.fromEntries(formData), teamIds })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }

  const input = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('annual_goals').insert({
    partner_id: partner.id,
    team_ids: input.teamIds,
    start_date: input.startDate,
    end_date: input.endDate,
    target: input.target,
    prize: input.prize,
    created_by: profile.id,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/programs')
  return { ok: 'Closers Club competition started.' }
}

/* -------------------------------------------------------------------------- */
/* Approving an annual goal prize — the one write here that commits money.     */
/* -------------------------------------------------------------------------- */

const ApproveGoalAward = z.object({
  goalId: z.guid(),
  personId: z.guid(),
})

export async function approveGoalAward(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'payouts.write')) {
    return { error: 'Approving a prize needs money permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const parsed = ApproveGoalAward.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: 'Something is missing there — try again.' }
  }

  const today = await partnerToday()
  const supabase = await createClient()

  const { error } = await supabase.from('goal_awards').insert({
    partner_id: partner.id,
    goal_id: parsed.data.goalId,
    person_id: parsed.data.personId,
    approved_at: today,
    approved_by: profile.id,
    approved_by_name: profile.name,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/programs')
  revalidatePath('/programs/prizes')
  return { ok: 'Prize approved.' }
}

/* -------------------------------------------------------------------------- */

function friendly(message: string): string {
  if (
    message.includes('competitions_window') ||
    message.includes('sprints_window') ||
    message.includes('annual_goals_window')
  ) {
    return 'The end date must be on or after the start date.'
  }
  if (message.includes('sprints_need_two_teams')) {
    return 'A sprint needs at least two pods.'
  }
  if (message.includes('sprints_rep_tiers_top_down')) {
    return 'Pod rep prize tiers must be turned on top-down — 1st before 2nd, 2nd before 3rd.'
  }
  if (message.includes('annual_goals_one_active_per_partner')) {
    return 'Only one Closers Club competition can run at a time for this partner — its dates overlap one that is already running.'
  }
  if (message.includes('violates row-level security') || message.includes('42501')) {
    return 'You do not have permission to do that.'
  }
  if (message.includes('duplicate key') || message.includes('goal_awards_goal_id_person_id_key')) {
    return 'That prize is already approved.'
  }
  // close_sprint/reopen_sprint raise plain-language exceptions on purpose; show those as-is.
  if (/^[A-Z]/.test(message) && message.length < 200) return message

  return 'Something went wrong saving that. Try again, and tell Charles if it keeps happening.'
}
