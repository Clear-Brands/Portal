import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner, partnerToday } from '@/lib/partner-context'

/**
 * Programme reads.
 *
 * Every ranking here comes from a view in 0009_views.sql — v_competition_standings,
 * v_sprint_team_standings, v_sprint_overall, v_annual_goal_standings — which run as
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

export interface SprintTeamStanding {
  teamId: string
  teamName: string
  teamColor: string
  closes: number
  spiff: number
  position: number
}

export interface SprintOverallStanding {
  personId: string
  personName: string
  teamId: string | null
  teamName: string | null
  closes: number
  spiff: number
  position: number
}

export interface TeamPrize {
  c1: string
  c2: string
  c3: string
  mgr: string
}

export interface Sprint {
  id: string
  partnerId: string
  name: string
  startDate: string
  endDate: string
  sprintType: 'winner' | 'perteam'
  teamIds: string[]
  prizeTeam1: string
  prizeTeam2: string
  prizeTeam3: string
  prizeRep1: string
  prizeRep2: string
  prizeRep3: string
  prizeManager: string
  teamPrizes: Record<string, TeamPrize>
  visible: boolean
  teamStandings: SprintTeamStanding[]
  overall: SprintOverallStanding[]
}

export async function listSprints(): Promise<Sprint[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()

  const [{ data: headers }, { data: teamRows }, { data: overallRows }] = await Promise.all([
    supabase
      .from('sprints')
      .select('*')
      .eq('partner_id', partner.id)
      .order('start_date', { ascending: false }),
    supabase
      .from('v_sprint_team_standings')
      .select('*')
      .eq('partner_id', partner.id)
      .order('position'),
    supabase
      .from('v_sprint_overall')
      .select('*')
      .eq('partner_id', partner.id)
      .order('position'),
  ])

  const teamsBySprint = new Map<string, SprintTeamStanding[]>()
  for (const row of (teamRows ?? []) as Row[]) {
    const id = row.sprint_id as string
    teamsBySprint.set(id, [
      ...(teamsBySprint.get(id) ?? []),
      {
        teamId: row.team_id as string,
        teamName: row.team_name as string,
        teamColor: (row.team_color as string) ?? '#6b6f76',
        closes: num(row.closes),
        spiff: num(row.spiff),
        position: num(row.position),
      },
    ])
  }

  const overallBySprint = new Map<string, SprintOverallStanding[]>()
  for (const row of (overallRows ?? []) as Row[]) {
    const id = row.sprint_id as string
    overallBySprint.set(id, [
      ...(overallBySprint.get(id) ?? []),
      {
        personId: row.person_id as string,
        personName: row.person_name as string,
        teamId: (row.team_id as string) ?? null,
        teamName: (row.team_name as string) ?? null,
        closes: num(row.closes),
        spiff: num(row.spiff),
        position: num(row.position),
      },
    ])
  }

  return ((headers ?? []) as Row[]).map((row) => ({
    id: row.id as string,
    partnerId: row.partner_id as string,
    name: row.name as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    sprintType: row.sprint_type as 'winner' | 'perteam',
    teamIds: (row.team_ids as string[]) ?? [],
    prizeTeam1: (row.prize_team_1 as string) ?? '',
    prizeTeam2: (row.prize_team_2 as string) ?? '',
    prizeTeam3: (row.prize_team_3 as string) ?? '',
    prizeRep1: (row.prize_rep_1 as string) ?? '',
    prizeRep2: (row.prize_rep_2 as string) ?? '',
    prizeRep3: (row.prize_rep_3 as string) ?? '',
    prizeManager: (row.prize_manager as string) ?? '',
    teamPrizes: (row.team_prizes as Record<string, TeamPrize>) ?? {},
    visible: Boolean(row.visible),
    teamStandings: teamsBySprint.get(row.id as string) ?? [],
    overall: overallBySprint.get(row.id as string) ?? [],
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
    // resolve pod names in TypeScript instead, the same way createSprint's
    // teamPrizes are keyed by id rather than joined.
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
  source: 'competition' | 'sprint_team' | 'sprint_rep' | 'annual_goal'
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
    const stillRunning = running(sprint.endDate)

    for (const t of sprint.teamStandings) {
      if (t.position > 3) continue
      const prize =
        sprint.sprintType === 'perteam'
          ? [sprint.teamPrizes[t.teamId]?.c1, sprint.teamPrizes[t.teamId]?.c2, sprint.teamPrizes[t.teamId]?.c3][
              t.position - 1
            ]
          : [sprint.prizeTeam1, sprint.prizeTeam2, sprint.prizeTeam3][t.position - 1]
      if (!prize) continue
      lines.push({
        source: 'sprint_team',
        sourceName: sprint.name,
        personId: null,
        personName: t.teamName,
        teamName: t.teamName,
        prize,
        status: stillRunning ? 'leading' : 'locked_in',
      })
    }

    for (const p of sprint.overall) {
      if (p.position > 3) continue
      const prize =
        sprint.sprintType === 'winner'
          ? [sprint.prizeRep1, sprint.prizeRep2, sprint.prizeRep3][p.position - 1]
          : undefined
      if (!prize) continue
      lines.push({
        source: 'sprint_rep',
        sourceName: sprint.name,
        personId: p.personId,
        personName: p.personName,
        teamName: p.teamName,
        prize,
        status: stillRunning ? 'leading' : 'locked_in',
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
