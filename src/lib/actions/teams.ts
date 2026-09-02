'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner } from '@/lib/partner-context'
import { requireSession } from '@/lib/session'
import { can } from '@/lib/auth/capabilities'
import type { ActionState } from '@/lib/actions/deals'

/**
 * Pod (team) management: add, rename, remove — the gap Charles flagged after
 * self-serve signup shipped ("where do we go to add/remove a pod for a
 * partner that's already onboarded?"). There wasn't one: onboardPartner()
 * creates exactly one pod up front, and every screen after that only lets
 * you assign people INTO an existing pod, never create or retire one.
 *
 * Internal-only, matching `teams_write` in 0008_rls.sql — that policy is
 * written against `my_role() = 'internal'` with no partner-admin branch, so
 * a partner admin can never write here even if this check were bypassed.
 * Partner admins still assign their own people into pods from the roster's
 * existing Edit action; only Clear Brands adds, renames or retires the pods
 * themselves.
 */

const AddPod = z.object({ name: z.string().trim().min(1, 'Name the pod').max(120) })

export async function addPod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (profile.role !== 'internal' || !can(profile, 'people.write')) {
    return { error: 'Only Clear Brands staff can add pods.' }
  }

  const partner = await getActivePartner()
  if (!partner) return { error: 'No partner program is selected.' }

  const parsed = AddPod.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Name the pod.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('teams')
    .insert({ partner_id: partner.id, name: parsed.data.name })

  if (error) return { error: friendly(error.message) }

  revalidatePath('/roster')
  return { ok: `${parsed.data.name} added.` }
}

const RenamePod = z.object({
  teamId: z.guid(),
  name: z.string().trim().min(1, 'Name the pod').max(120),
})

export async function renamePod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (profile.role !== 'internal' || !can(profile, 'people.write')) {
    return { error: 'Only Clear Brands staff can rename pods.' }
  }

  const parsed = RenamePod.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('teams')
    .update({ name: parsed.data.name })
    .eq('id', parsed.data.teamId)

  if (error) return { error: friendly(error.message) }

  revalidatePath('/roster')
  return { ok: 'Renamed.' }
}

const RemovePod = z.object({ teamId: z.guid() })

/**
 * Deleting a team cascades further than the roster: competitions, annual
 * goals, and a closed sprint's frozen prize results (sprint_pod_results /
 * sprint_rep_results) all reference team_id with `on delete cascade`
 * (0005_programs.sql, 0020_sprint_prize_slots.sql) — removing a pod that's
 * ever been used in one of those would silently take that history with it.
 * People on the pod are the one thing that's genuinely safe to cascade
 * (people.team_id is `on delete set null`, same as leaving a pod blank
 * anywhere else in the app), so this checks for the program-history case
 * first and refuses rather than letting it disappear quietly.
 */
export async function removePod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireSession()
  if (profile.role !== 'internal' || !can(profile, 'people.write')) {
    return { error: 'Only Clear Brands staff can remove pods.' }
  }

  const parsed = RemovePod.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Something is missing there — try again.' }

  const supabase = await createClient()

  const [{ count: compCount }, { count: goalCount }, { count: resultCount }, { data: sprintsUsing }] =
    await Promise.all([
      supabase.from('competitions').select('id', { count: 'exact', head: true }).eq('team_id', parsed.data.teamId),
      supabase.from('annual_goals').select('id', { count: 'exact', head: true }).eq('team_id', parsed.data.teamId),
      supabase
        .from('sprint_pod_results')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', parsed.data.teamId),
      supabase.from('sprints').select('id').contains('team_ids', [parsed.data.teamId]),
    ])

  if ((compCount ?? 0) > 0 || (goalCount ?? 0) > 0 || (resultCount ?? 0) > 0 || (sprintsUsing?.length ?? 0) > 0) {
    return {
      error:
        "This pod has competitions, goals, or sprint history tied to it, so removing it would take that history with it too. Rename it instead of removing it, or ask engineering if it truly needs to go.",
    }
  }

  const { error } = await supabase.from('teams').delete().eq('id', parsed.data.teamId)
  if (error) return { error: friendly(error.message) }

  revalidatePath('/roster')
  return { ok: 'Removed. Anyone who was in it now shows as No pod.' }
}

function friendly(message: string): string {
  if (message.includes('violates row-level security') || message.includes('42501')) {
    return 'You do not have permission to do that.'
  }
  if (message.includes('duplicate key') || message.includes('teams_partner_id_name_key')) {
    return 'A pod with that name already exists.'
  }
  if (/^[A-Z]/.test(message) && message.length < 200) return message
  return 'Something went wrong saving that. Try again, and tell Charles if it keeps happening.'
}
