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

const TeamPrizeSchema = z.object({
  c1: z.string().trim().max(160).optional().default(''),
  c2: z.string().trim().max(160).optional().default(''),
  c3: z.string().trim().max(160).optional().default(''),
  mgr: z.string().trim().max(160).optional().default(''),
})

const SprintSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the sprint a name').max(160),
    startDate: z.iso.date('Enter a valid start date'),
    endDate: z.iso.date('Enter a valid end date'),
    sprintType: z.enum(['winner', 'perteam']),
    repPrizeScope: z.enum(['sprint_wide', 'winning_pod']).optional().default('sprint_wide'),
    teamIds: z.array(z.uuid()).min(2, 'A sprint needs at least two pods'),
    prizeTeam1: z.string().trim().max(160).optional().default(''),
    prizeTeam2: z.string().trim().max(160).optional().default(''),
    prizeTeam3: z.string().trim().max(160).optional().default(''),
    prizeRep1: z.string().trim().max(160).optional().default(''),
    prizeRep2: z.string().trim().max(160).optional().default(''),
    prizeRep3: z.string().trim().max(160).optional().default(''),
    prizeManager: z.string().trim().max(160).optional().default(''),
    teamPrizes: z.record(z.string(), TeamPrizeSchema).optional().default({}),
    visible: z.string().optional(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  })

/** Pull `teamPrize.<teamId>.<field>` fields out of the raw form into a nested object. */
function collectTeamPrizes(formData: FormData): Record<string, { c1: string; c2: string; c3: string; mgr: string }> {
  const out: Record<string, { c1: string; c2: string; c3: string; mgr: string }> = {}
  for (const [key, value] of formData.entries()) {
    const match = /^teamPrize\.([^.]+)\.(c1|c2|c3|mgr)$/.exec(key)
    if (!match) continue
    const [, teamId, field] = match
    out[teamId!] ??= { c1: '', c2: '', c3: '', mgr: '' }
    out[teamId!]![field as 'c1' | 'c2' | 'c3' | 'mgr'] = String(value)
  }
  return out
}

export async function createSprint(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (!can(profile, 'programs.write')) {
    return { error: 'Creating a sprint needs programme permissions.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const raw = Object.fromEntries(formData)
  const teamIds = formData.getAll('teamIds').map(String)
  const teamPrizes = collectTeamPrizes(formData)

  const parsed = SprintSchema.safeParse({ ...raw, teamIds, teamPrizes })
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
    sprint_type: input.sprintType,
    rep_prize_scope: input.repPrizeScope,
    team_ids: input.teamIds,
    prize_team_1: input.prizeTeam1,
    prize_team_2: input.prizeTeam2,
    prize_team_3: input.prizeTeam3,
    prize_rep_1: input.prizeRep1,
    prize_rep_2: input.prizeRep2,
    prize_rep_3: input.prizeRep3,
    prize_manager: input.prizeManager,
    team_prizes: input.teamPrizes,
    visible: input.visible === 'on',
    created_by: profile.id,
  })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/programs')
  return { ok: `${input.name} created.` }
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
    teamIds: z.array(z.uuid()).optional().default([]),
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
  goalId: z.uuid(),
  personId: z.uuid(),
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
  if (message.includes('annual_goals_one_active_per_partner')) {
    return 'Only one Closers Club competition can run at a time for this partner — its dates overlap one that is already running.'
  }
  if (message.includes('violates row-level security') || message.includes('42501')) {
    return 'You do not have permission to do that.'
  }
  if (message.includes('duplicate key') || message.includes('goal_awards_goal_id_person_id_key')) {
    return 'That prize is already approved.'
  }
  return 'Something went wrong saving that. Try again, and tell Charles if it keeps happening.'
}
