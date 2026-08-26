import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner, partnerToday } from '@/lib/partner-context'

/**
 * Programme reads.
 *
 * Every ranking here comes from a view — v_competition_standings and
 * v_annual_goal_standings (0009_views.sql), v_sprint_pod_standings and
 * v_sprint_rep_standings (0020_sprint_prize_slots.sql) — which run as
 * their owner and do their own tenancy and visibility filtering. This module reads
 * those views and the header tables (competitions, sprints, annual_goals) and merges
 * them in TypeScript. That merge is structural only: grouping rows that are already
 * ranked and summed, exactly like `groupBatchByPerson` does for payouts. No position,
 * no count and no total is computed here.
 */

type Row = Record<string, unknown>

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

/* -------------------------------------------------------------------------- */
/* Competitions                                                                */
/* -------------------------------------------------------------------------- */

export interface CompetitionStanding {
  personId: string
  personName: string
  teamId: string | null
  teamName: string | null
  closes: number
  spiff: number
  position: number
  qualified: boolean
  closesToQualify: number
  prize: string
}

export interface Competition {
  id: string
  partnerId: string
  teamId: string | null
  teamName: string | null
  name: string
  startDate: string
  endDate: string
  prize1: string
  prize2: string
  prize3: string
  minCloses: number
  visible: boolean
  standings: CompetitionStanding[]
}

function toStanding(row: Row): CompetitionStanding {
  return {
    personId: row.person_id as string,
    personName: row.person_name as string,
    teamId: (row.team_id as string) ?? null,
    teamName: (row.team_name as string) ?? null,
    closes: num(row.closes),
    spiff: num(row.spiff),
    position: num(row.position),
    qualified: Boolean(row.qualified),
    closesToQualify: num(row.closes_to_qualify),
    prize: (row.prize as string) ?? '',
  }
}

export async function listCompetitions(): Promise<Competition[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()

  // Headers first — a competition with nobody on the board yet still needs a
  // card. v_competition_standings only carries rows once someone has closed
  // something in the window, because its lateral join isn't a left join.
  const [{ data: headers }, { data: standings }] = await Promise.all([
    supabase
      .from('competitions')
      .select('id, partner_id, team_id, name, start_date, end_date, prize_1, prize_2, prize_3, min_closes, visible, teams(name)')
      .eq('partner_id', partner.id)
      .order('start_date', { ascending: false }),
    supabase
      .from('v_competition_standings')
      .select('*')
      .eq('partner_id', partner.id)
      .order('position'),
  ])

  const byCompetition = new Map<string, CompetitionStanding[]>()
  for (const row of (standings ?? []) as Row[]) {
    const id = row.competition_id as string
    byCompetition.set(id, [...(byCompetition.get(id) ?? []), toStanding(row)])
  }

  return ((headers ?? []) as Row[]).map((row) => {
    const team = row.teams as { name?: string } | { name?: string }[] | null
    const t = Array.isArray(team) ? team[0] : team
    return {
      id: row.id as string,
      partnerId: row.partner_id as string,
      teamId: (row.team_id as string) ?? null,
      teamName: t?.name ?? null,
      name: row.name as string,
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      prize1: (row.prize_1 as string) ?? '',
      prize2: (row.prize_2 as string) ?? '',
      prize3: (row.prize_3 as string) ?? '',
      minCloses: num(row.min_closes),
      visible: Boolean(row.visible),
      standings: byCompetition.get(row.id as string) ?? [],
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Sprints                                                                     */
/* -------------------------------------------------------------------------- */

export interface SprintPodStanding {
  teamId: string
  teamName: string
  teamColor: string
  managerIds: string[]
  managerNames: string[]
  closes: number
  spiff: number
  position: number
  /** Frozen (from sprint_pod_results) once the sprint is closed, live otherwise. */
  isClosed: boolean
}

export interface SprintRepStanding {
  teamId: string
  personId: string
  personName: string
  closes: number
  spiff: number
  /** Rank within this rep's own pod — never against the other pods in the sprint. */
  position: number
  isClosed: boolean
}

/**
 * Six independent prize slots — see the schema comment on `SprintSchema` in
 * actions/programs.ts. Each `*Enabled` flag has a matching `*Prize` string;
 * a slot with no prize text set is still "enabled" until the admin fills one
 * in, so callers should treat `enabled && prize` as "actually pays out."
 */
export interface Sprint {
  id: string
  partnerId: string
  name: string
  startDate: string
  endDate: string
  teamIds: string[]
  podRep1Enabled: boolean
  podRep1Prize: string
  podRep2Enabled: boolean
  podRep2Prize: string
  podRep3Enabled: boolean
  podRep3Prize: string
  podManagerEnabled: boolean
  podManagerPrize: string
  topRepTopPodEnabled: boolean
  topRepTopPodPrize: string
  topPodManagerEnabled: boolean
  topPodManagerPrize: string
  visible: boolean
  /** Null while running — a sprint's end date is a target, not an auto-cutoff.
   *  Set only by the manual "Close sprint" action. */
  closedAt: string | null
  closedBy: string | null
  /** Ranked by position ascending — position 1 is the leading pod. */
  podStandings: SprintPodStanding[]
  /** Keyed by pod, each pod's own reps ranked 1-3 within that pod alone. */
  repStandingsByPod: Record<string, SprintRepStanding[]>
}

export async function listSprints(): Promise<Sprint[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()

  // v_sprint_pod_standings / v_sprint_rep_standings already carry manager
  // names and switch live vs. frozen rows on their own (union of
  // v_sprint_*_live for an open sprint, sprint_*_results for a closed one) —
  // nothing else here needs to know which state a given sprint is in.
  const [{ data: headers }, { data: podRows }, { data: repRows }] = await Promise.all([
    supabase.from('sprints').select('*').eq('partner_id', partner.id).order('start_date', { ascending: false }),
    supabase.from('v_sprint_pod_standings').select('*').eq('partner_id', partner.id).order('position'),
    supabase.from('v_sprint_rep_standings').select('*').eq('partner_id', partner.id).order('position'),
  ])

  const podsBySprint = new Map<string, SprintPodStanding[]>()
  for (const row of (podRows ?? []) as Row[]) {
    const id = row.sprint_id as string
    podsBySprint.set(id, [
      ...(podsBySprint.get(id) ?? []),
      {
        teamId: row.team_id as string,
        teamName: row.team_name as string,
        teamColor: (row.team_color as string) ?? '#6b6f76',
        managerIds: (row.manager_ids as string[]) ?? [],
        managerNames: (row.manager_names as string[]) ?? [],
        closes: num(row.closes),
        spiff: num(row.spiff),
        position: num(row.position),
        isClosed: Boolean(row.is_closed),
      },
    ])
  }

  // Keyed by sprint, then by pod — each pod's own top 3, independent of every
  // other pod racing in the same sprint.
  const repsBySprint = new Map<string, Record<string, SprintRepStanding[]>>()
  for (const row of (repRows ?? []) as Row[]) {
    const sprintId = row.sprint_id as string
    const teamId = row.team_id as string
    const bySprint = repsBySprint.get(sprintId) ?? {}
    bySprint[teamId] = [
      ...(bySprint[teamId] ?? []),
      {
        teamId,
        personId: row.person_id as string,
        personName: row.person_name as string,
        closes: num(row.closes),
        spiff: num(row.spiff),
        position: num(row.position),
        isClosed: Boolean(row.is_closed),
      },
    ]
    repsBySprint.set(sprintId, bySprint)
  }

  return ((headers ?? []) as Row[]).map((row) => ({
    id: row.id as string,
    partnerId: row.partner_id as string,
    name: row.name as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    teamIds: (row.team_ids as string[]) ?? [],
    podRep1Enabled: Boolean(row.pod_rep_1_enabled),
    podRep1Prize: (row.pod_rep_1_prize as string) ?? '',
    podRep2Enabled: Boolean(row.pod_rep_2_enabled),
    podRep2Prize: (row.pod_rep_2_prize as string) ?? '',
    podRep3Enabled: Boolean(row.pod_rep_3_enabled),
    podRep3Prize: (row.pod_rep_3_prize as string) ?? '',
    podManagerEnabled: Boolean(row.pod_manager_enabled),
    podManagerPrize: (row.pod_manager_prize as string) ?? '',
    topRepTopPodEnabled: Boolean(row.top_rep_top_pod_enabled),
    topRepTopPodPrize: (row.top_rep_top_pod_prize as string) ?? '',
    topPodManagerEnabled: Boolean(row.top_pod_manager_enabled),
    topPodManagerPrize: (row.top_pod_manager_prize as string) ?? '',
    visible: Boolean(row.visible),
    closedAt: (row.closed_at as string) ?? null,
    closedBy: (row.closed_by as string) ?? null,
    podStandings: podsBySprint.get(row.id as string) ?? [],
    repStandingsByPod: repsBySprint.get(row.id as string) ?? {},
  }))
}

/* -------------------------------------------------------------------------- */
/* Annual goals                                                                */
/* -------------------------------------------------------------------------- */

export interface AnnualGoalStanding {
  personId: string
  personName: string
  teamId: string | null
  closes: number
  achieved: boolean
  remaining: number
  approved: boolean
  approvedAt: string | null
}

export interface AnnualGoal {
  id: string
  partnerId: string
  teamIds: string[]
  teamNames: string[]
  target: number
  prize: string
  startDate: string
  endDate: string
  standings: AnnualGoalStanding[]
}

export async function listAnnualGoals(): Promise<AnnualGoal[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()

  const [{ data: headers }, { data: standingRows }, { data: teamRows }] = await Promise.all([
    supabase
      .from('annual_goals')
      .select('id, partner_id, team_ids, target, prize, start_date, end_date')
      .eq('partner_id', partner.id)
      .order('start_date', { ascending: false }),
    supabase
      .from('v_annual_goal_standings')
      .select('*')
      .eq('partner_id', partner.id)
      .order('closes', { ascending: false }),
    // team_ids is a plain array, not a foreign key PostgREST can embed —
    // resolve pod names in TypeScript instead.
    supabase.from('teams').select('id, name').eq('partner_id', partner.id),
  ])

  const teamNameById = new Map(((teamRows ?? []) as Row[]).map((t) => [t.id as string, t.name as string]))

  const byGoal = new Map<string, AnnualGoalStanding[]>()
  for (const row of (standingRows ?? []) as Row[]) {
    const id = row.goal_id as string
    byGoal.set(id, [
      ...(byGoal.get(id) ?? []),
      {
        personId: row.person_id as string,
        personName: row.person_name as string,
        teamId: (row.team_id as string) ?? null,
        closes: num(row.closes),
        achieved: Boolean(row.achieved),
        remaining: num(row.remaining),
        approved: Boolean(row.approved),
        approvedAt: (row.approved_at as string) ?? null,
      },
    ])
  }

  return ((headers ?? []) as Row[]).map((row) => {
    const teamIds = ((row.team_ids as string[]) ?? []).filter(Boolean)
    return {
      id: row.id as string,
      partnerId: row.partner_id as string,
      teamIds,
      teamNames: teamIds.map((id) => teamNameById.get(id)).filter((n): n is string => Boolean(n)),
      target: num(row.target),
      prize: (row.prize as string) ?? '',
      startDate: row.start_date as string,
      endDate: row.end_date as string,
      standings: byGoal.get(row.id as string) ?? [],
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Prize lines — who is owed what, across every programme.                     */
/* -------------------------------------------------------------------------- */

export type PrizeStatus = 'leading' | 'locked_in' | 'awaiting_approval' | 'approved'

export interface PrizeLine {
  source: 'competition' | 'sprint_team' | 'sprint_rep' | 'sprint_manager' | 'annual_goal'
  sourceName: string
  personId: string | null
  personName: string
  teamName: string | null
  prize: string
  status: PrizeStatus
  /** Present only for an annual goal award, which is the one thing here that is
   *  actually approved through a database write rather than just observed. */
  goalId?: string
  closes?: number
  target?: number
}

export const PRIZE_STATUS_LABEL: Record<PrizeStatus, string> = {
  leading: 'Leading',
  locked_in: 'Locked in',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
}

export async function listPrizeLines(): Promise<PrizeLine[]> {
  const [competitions, sprints, goals, today] = await Promise.all([
    listCompetitions(),
    listSprints(),
    listAnnualGoals(),
    partnerToday(),
  ])

  const lines: PrizeLine[] = []
  const running = (endDate: string) => endDate >= today

  for (const comp of competitions) {
    for (const s of comp.standings) {
      if (!s.qualified || !s.prize) continue
      lines.push({
        source: 'competition',
        sourceName: comp.name,
        personId: s.personId,
        personName: s.personName,
        teamName: s.teamName,
        prize: s.prize,
        status: running(comp.endDate) ? 'leading' : 'locked_in',
      })
    }
  }

  for (const sprint of sprints) {
    // A sprint's end date is a target, not an auto-cutoff — standings keep
    // moving until an admin manually closes it. `closedAt` is the only real
    // "this is final" signal now; endDate no longer decides it.
    const stillRunning = sprint.closedAt === null
    const status = stillRunning ? 'leading' : 'locked_in'
    const topPod = sprint.podStandings.find((p) => p.position === 1) ?? null

    // Pod rep tiers 1-3: the same prize text, paid out in every pod, to
    // whichever rep holds that rank within their own pod (never against the
    // other pods in the sprint).
    const repTiers: [boolean, string][] = [
      [sprint.podRep1Enabled, sprint.podRep1Prize],
      [sprint.podRep2Enabled, sprint.podRep2Prize],
      [sprint.podRep3Enabled, sprint.podRep3Prize],
    ]
    for (const pod of sprint.podStandings) {
      const reps = sprint.repStandingsByPod[pod.teamId] ?? []
      repTiers.forEach(([enabled, prize], i) => {
        if (!enabled || !prize) return
        const rep = reps.find((r) => r.position === i + 1)
        if (!rep) return
        lines.push({
          source: 'sprint_rep',
          sourceName: sprint.name,
          personId: rep.personId,
          personName: rep.personName,
          teamName: pod.teamName,
          prize,
          status,
        })
      })
    }

    // Pod manager: pays every pod's manager(s), unconditionally — not just
    // the winning pod's. Distinct from "Top pod manager" below.
    if (sprint.podManagerEnabled && sprint.podManagerPrize) {
      for (const pod of sprint.podStandings) {
        pod.managerIds.forEach((managerId, i) => {
          lines.push({
            source: 'sprint_manager',
            sourceName: sprint.name,
            personId: managerId,
            personName: pod.managerNames[i] ?? '',
            teamName: pod.teamName,
            prize: sprint.podManagerPrize,
            status,
          })
        })
      }
    }

    // Top rep, top pod: one prize, to the #1 rep on the #1-ranked pod.
    if (sprint.topRepTopPodEnabled && sprint.topRepTopPodPrize && topPod) {
      const topRep = (sprint.repStandingsByPod[topPod.teamId] ?? []).find((r) => r.position === 1)
      if (topRep) {
        lines.push({
          source: 'sprint_rep',
          sourceName: sprint.name,
          personId: topRep.personId,
          personName: topRep.personName,
          teamName: topPod.teamName,
          prize: sprint.topRepTopPodPrize,
          status,
        })
      }
    }

    // Top pod manager: one prize, to the #1-ranked pod's manager(s) only.
    if (sprint.topPodManagerEnabled && sprint.topPodManagerPrize && topPod) {
      topPod.managerIds.forEach((managerId, i) => {
        lines.push({
          source: 'sprint_manager',
          sourceName: sprint.name,
          personId: managerId,
          personName: topPod.managerNames[i] ?? '',
          teamName: topPod.teamName,
          prize: sprint.topPodManagerPrize,
          status,
        })
      })
    }
  }

  for (const goal of goals) {
    for (const s of goal.standings) {
      if (!s.achieved || !goal.prize) continue
      lines.push({
        source: 'annual_goal',
        sourceName: `${goal.target}-close Closers Club`,
        personId: s.personId,
        personName: s.personName,
        teamName: null,
        prize: goal.prize,
        status: s.approved ? 'approved' : 'awaiting_approval',
        goalId: goal.id,
        closes: s.closes,
        target: goal.target,
      })
    }
  }

  return lines
}
