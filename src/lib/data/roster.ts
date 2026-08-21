import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner } from '@/lib/partner-context'
import { listTeamOptions } from '@/lib/data/deals'
import type { Page, TeamOption } from '@/lib/types'
import type { RosterFilters } from '@/lib/roster/filters'

/**
 * Roster reads.
 *
 * `v_person_stats` in 0009_views.sql already aggregates production per person —
 * deals sent, closes, spiff earned and payable. This module searches, sorts and
 * pages that view server-side and does nothing beyond it: no count here is
 * recomputed from raw deal rows.
 */

type Row = Record<string, unknown>

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

export interface RosterRow {
  id: string
  teamId: string | null
  teamName: string | null
  teamColor: string
  name: string
  email: string
  kind: 'rep' | 'manager'
  active: boolean
  dealsSent: number
  closes: number
  closeRatio: number
  spiffEarned: number
  spiffPayable: number
  openDeals: number
  hasLogin: boolean
}

function toRosterRow(row: Row): Omit<RosterRow, 'hasLogin'> {
  return {
    id: row.person_id as string,
    teamId: (row.team_id as string) ?? null,
    teamName: (row.team_name as string) ?? null,
    teamColor: (row.team_color as string) ?? '#6b6f76',
    name: row.name as string,
    email: row.email as string,
    kind: row.kind as 'rep' | 'manager',
    active: Boolean(row.active),
    dealsSent: num(row.deals_sent),
    closes: num(row.closes),
    closeRatio: num(row.close_ratio),
    spiffEarned: num(row.spiff_earned),
    spiffPayable: num(row.spiff_payable),
    openDeals: num(row.open_deals),
  }
}

const SORT_COLUMN: Record<RosterFilters['sort'], string> = {
  name: 'name',
  sent: 'deals_sent',
  closes: 'closes',
  spiffs: 'spiff_earned',
}

export async function listRoster(filters: RosterFilters): Promise<Page<RosterRow>> {
  const partner = await getActivePartner()
  if (!partner) {
    return { rows: [], total: 0, page: filters.page, perPage: filters.perPage, pageCount: 1 }
  }

  const supabase = await createClient()

  let query = supabase
    .from('v_person_stats')
    .select('*', { count: 'exact' })
    .eq('partner_id', partner.id)

  if (filters.status === 'active') query = query.eq('active', true)
  if (filters.status === 'inactive') query = query.eq('active', false)
  if (filters.teamId === 'none') query = query.is('team_id', null)
  else if (filters.teamId) query = query.eq('team_id', filters.teamId)

  const clean = filters.q.replace(/[,()"\\%]/g, ' ').trim()
  if (clean) query = query.or(`name.ilike.%${clean}%,email.ilike.%${clean}%`)

  const column = SORT_COLUMN[filters.sort]
  query = query.order(column, { ascending: filters.sort === 'name' })

  const from = (filters.page - 1) * filters.perPage
  const { data, count, error } = await query.range(from, from + filters.perPage - 1)

  if (error) throw new Error(`Could not load the roster: ${error.message}`)

  const partial = (data ?? []).map(toRosterRow)
  const ids = partial.map((p) => p.id)

  const { data: logins } = ids.length
    ? await supabase.from('profiles').select('person_id').in('person_id', ids)
    : { data: [] as { person_id: string }[] }
  const withLogin = new Set((logins ?? []).map((l) => l.person_id as string))

  const rows: RosterRow[] = partial.map((p) => ({ ...p, hasLogin: withLogin.has(p.id) }))
  const total = count ?? 0

  return {
    rows,
    total,
    page: filters.page,
    perPage: filters.perPage,
    pageCount: Math.max(1, Math.ceil(total / filters.perPage)),
  }
}

export interface PodCount {
  teamId: string | null
  teamName: string
  teamColor: string
  count: number
}

/** Pod tab counts, honouring the current search and status filter so a tab's
 *  number always matches what clicking it would show. */
export async function rosterPodCounts(
  filters: Pick<RosterFilters, 'q' | 'status'>,
): Promise<{ all: number; noPod: number; teams: (TeamOption & { count: number })[] }> {
  const partner = await getActivePartner()
  if (!partner) return { all: 0, noPod: 0, teams: [] }

  const supabase = await createClient()
  const teams = await listTeamOptions()

  const base = () => {
    let q = supabase
      .from('v_person_stats')
      .select('person_id', { count: 'exact', head: true })
      .eq('partner_id', partner.id)
    if (filters.status === 'active') q = q.eq('active', true)
    if (filters.status === 'inactive') q = q.eq('active', false)
    const clean = filters.q.replace(/[,()"\\%]/g, ' ').trim()
    if (clean) q = q.or(`name.ilike.%${clean}%,email.ilike.%${clean}%`)
    return q
  }

  const [allResult, noPodResult, teamResults] = await Promise.all([
    base(),
    base().is('team_id', null),
    Promise.all(teams.map((t) => base().eq('team_id', t.id))),
  ])

  return {
    all: allResult.count ?? 0,
    noPod: noPodResult.count ?? 0,
    teams: teams.map((t, i) => ({ ...t, count: teamResults[i]?.count ?? 0 })),
  }
}

export async function getRosterPerson(id: string): Promise<RosterRow | null> {
  const partner = await getActivePartner()
  if (!partner) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('v_person_stats')
    .select('*')
    .eq('partner_id', partner.id)
    .eq('person_id', id)
    .maybeSingle()

  if (!data) return null

  const { data: login } = await supabase
    .from('profiles')
    .select('id')
    .eq('person_id', id)
    .maybeSingle()

  return { ...toRosterRow(data), hasLogin: Boolean(login) }
}
