import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner, partnerToday } from '@/lib/partner-context'
import { resolveWindow, type DealFilters } from '@/lib/deals/filters'
import type { Deal, DealStatus, Page, PayableLine, PersonOption, TeamOption } from '@/lib/types'
import { toPayableLine } from '@/lib/types'

/**
 * Deal reads.
 *
 * Every list is a paged SQL query and every total is a SQL aggregate over the
 * whole matching set — never over the visible page. Both go through
 * `filtered_deals()` in 0012, so the table and the summary above it are
 * physically incapable of disagreeing about which deals they describe.
 */

/** The row shape `search_deals()` returns. */
interface SearchRow {
  id: string
  partner_id: string
  person_id: string
  person_name: string
  team_name: string | null
  team_color: string
  client_name: string
  company: string
  service: string
  services: string[] | null
  status: DealStatus
  spiff_amount: string
  partner_comp: string
  deal_value: string
  monthly_value: string
  live: boolean | null
  contact: string
  phone: string
  email: string
  city: string
  state: string
  employee_count: number | null
  promo_note: string
  lost_reason: string
  churn_note: string
  churned_at: string | null
  closed_at: string | null
  lost_at: string | null
  payout_id: string | null
  created_at: string
  locked: boolean
  age_days: number
  total_count: number
}

/** A deal as the list renders it, with the two derived flags the UI needs. */
export interface DealRow extends Deal {
  teamColor: string
  /** Inside a live payout batch — cannot be moved until that batch is voided. */
  locked: boolean
  ageDays: number
}

const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0

function toDealRow(r: SearchRow): DealRow {
  return {
    id: r.id,
    partnerId: r.partner_id,
    personId: r.person_id,
    personName: r.person_name,
    teamName: r.team_name,
    teamColor: r.team_color,
    clientName: r.client_name,
    company: r.company ?? '',
    service: r.service ?? '',
    services: r.services ?? (r.service ? [r.service] : []),
    status: r.status,
    spiffAmount: n(r.spiff_amount),
    partnerComp: n(r.partner_comp),
    dealValue: n(r.deal_value),
    monthlyValue: n(r.monthly_value),
    live: r.live,
    contact: r.contact ?? '',
    phone: r.phone ?? '',
    email: r.email ?? '',
    city: r.city ?? '',
    state: r.state ?? '',
    employeeCount: r.employee_count ?? null,
    promoNote: r.promo_note ?? '',
    lostReason: r.lost_reason ?? '',
    churnNote: r.churn_note ?? '',
    churnedAt: r.churned_at,
    closedAt: r.closed_at,
    lostAt: r.lost_at,
    payoutId: r.payout_id,
    createdAt: r.created_at,
    locked: r.locked,
    ageDays: r.age_days,
  }
}

/** Turn UI filters into the arguments both SQL functions take. */
async function toArgs(filters: DealFilters, partnerId: string) {
  const today = await partnerToday()
  const { from, to } = resolveWindow(filters, today)

  return {
    p_partner_id: partnerId,
    p_status: filters.status === 'all' ? null : filters.status,
    p_team_id: filters.teamId,
    p_person_id: filters.personId,
    p_from: from,
    p_to: to,
    p_on: filters.on,
    p_q: filters.q || null,
    p_churned: filters.churned ? true : null,
  }
}

export async function listDeals(filters: DealFilters): Promise<Page<DealRow>> {
  const partner = await getActivePartner()
  if (!partner) {
    return { rows: [], total: 0, page: filters.page, perPage: filters.perPage, pageCount: 1 }
  }

  const supabase = await createClient()
  const args = await toArgs(filters, partner.id)

  const { data, error } = await supabase.rpc('search_deals', {
    ...args,
    p_sort: filters.sort,
    p_limit: filters.perPage,
    p_offset: (filters.page - 1) * filters.perPage,
  })

  if (error) throw new Error(`Could not load deals: ${error.message}`)

  const rows = (data ?? []) as SearchRow[]
  // total_count rides along on every row, so paging costs one query, not two.
  const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0

  return {
    rows: rows.map(toDealRow),
    total,
    page: filters.page,
    perPage: filters.perPage,
    pageCount: Math.max(1, Math.ceil(total / filters.perPage)),
  }
}

export interface DealSummary {
  count: number
  spiffTotal: number
  payableTotal: number
  compTotal: number
  closes: number
}

/** Totals across every matching deal, for the line above the table. */
export async function summariseDeals(filters: DealFilters): Promise<DealSummary> {
  const partner = await getActivePartner()
  if (!partner) return { count: 0, spiffTotal: 0, payableTotal: 0, compTotal: 0, closes: 0 }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('summarise_deals', await toArgs(filters, partner.id))

  if (error) throw new Error(`Could not summarise deals: ${error.message}`)

  const row = (Array.isArray(data) ? data[0] : data) ?? {}
  return {
    count: n(row.deal_count),
    spiffTotal: n(row.spiff_total),
    payableTotal: n(row.payable_total),
    compTotal: n(row.comp_total),
    closes: n(row.closes),
  }
}

export async function getDeal(id: string): Promise<DealRow | null> {
  const partner = await getActivePartner()
  if (!partner) return null

  const supabase = await createClient()
  const { data } = await supabase.rpc('search_deals', {
    p_partner_id: partner.id,
    p_limit: 1000,
  })

  const row = ((data ?? []) as SearchRow[]).find((r) => r.id === id)
  return row ? toDealRow(row) : null
}

/* -------------------------------------------------------------------------- */
/* Per-stage duration                                                           */
/* -------------------------------------------------------------------------- */

export interface StageDuration {
  status: DealStatus
  enteredAt: string
  /** Whole days spent in this stage — from enteredAt to the next entry, or to
   *  now for the deal's current stage. */
  days: number
  current: boolean
}

/**
 * How long a deal has spent in each stage it has passed through, computed
 * from deal_status_history (0026) — logged automatically on every
 * transition, so this never drifts from what actually happened. RLS on that
 * table mirrors deals' own read policies, so a member calling this for a
 * deal that is not theirs simply gets nothing back.
 */
export async function getDealStatusHistory(dealId: string): Promise<StageDuration[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('deal_status_history')
    .select('status, entered_at')
    .eq('deal_id', dealId)
    .order('entered_at', { ascending: true })

  const rows = (data ?? []) as { status: DealStatus; entered_at: string }[]
  const now = Date.now()

  return rows.map((row, i) => {
    const next = rows[i + 1]
    const end = next ? new Date(next.entered_at).getTime() : now
    const start = new Date(row.entered_at).getTime()
    return {
      status: row.status,
      enteredAt: row.entered_at,
      days: Math.max(0, Math.round((end - start) / 86_400_000)),
      current: !next,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                     */
/* -------------------------------------------------------------------------- */

const PIPELINE_PER_COLUMN = 40

export interface Pipeline {
  columns: Record<DealStatus, DealRow[]>
  counts: Record<string, number>
  perColumn: number
}

/**
 * @param churned When true, every column only shows deals that have gone
 *   churned (churned_at set) — same tri-state meaning as DealFilters.churned:
 *   this narrows within a status, it does not replace it. A churned account
 *   almost always sits in 'paid', but this doesn't assume that — a card only
 *   moves off the board when its underlying status filter says so.
 */
export async function loadPipeline(churned = false): Promise<Pipeline | null> {
  const partner = await getActivePartner()
  if (!partner) return null

  const supabase = await createClient()
  const statuses: DealStatus[] = ['submitted', 'in_talks', 'closed', 'paid', 'lost']
  const p_churned = churned ? true : null

  const [columnResults, countResult] = await Promise.all([
    Promise.all(
      statuses.map(async (status) => {
        const { data } = await supabase.rpc('search_deals', {
          p_partner_id: partner.id,
          p_status: status,
          p_sort: 'newest',
          p_limit: PIPELINE_PER_COLUMN,
          p_churned,
        })
        return [status, ((data ?? []) as SearchRow[]).map(toDealRow)] as const
      }),
    ),
    supabase.rpc('deal_status_counts', { p_partner_id: partner.id, p_churned }),
  ])

  const counts: Record<string, number> = {}
  for (const row of (countResult.data ?? []) as { status: string; count: number }[]) {
    counts[row.status] = Number(row.count)
  }

  return {
    columns: Object.fromEntries(columnResults) as Record<DealStatus, DealRow[]>,
    counts,
    perColumn: PIPELINE_PER_COLUMN,
  }
}

/* -------------------------------------------------------------------------- */
/* Stalled deals                                                                */
/* -------------------------------------------------------------------------- */

export interface StalledDeal {
  id: string
  clientName: string
  personName: string
  status: DealStatus
  ageDays: number
}

export async function listStalledDeals(days = 30): Promise<StalledDeal[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()
  const { data } = await supabase.rpc('stalled_deals', {
    p_partner_id: partner.id,
    p_days: days,
  })

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    clientName: r.client_name as string,
    personName: r.person_name as string,
    status: r.status as DealStatus,
    ageDays: Number(r.age_days),
  }))
}

/* -------------------------------------------------------------------------- */
/* Options for the filter controls                                              */
/* -------------------------------------------------------------------------- */

export async function listTeamOptions(): Promise<TeamOption[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('teams')
    .select('id, name, color')
    .eq('partner_id', partner.id)
    .order('name')

  return (data ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    color: (t.color as string) ?? '#6b6f76',
  }))
}

/**
 * People for the rep picker, searched on demand.
 *
 * The original rendered an <option> element for every rep inside an <optgroup>
 * per team, rebuilt on every render — 500 of them, on every keystroke.
 */
export async function searchPeople(term = '', limit = 50): Promise<PersonOption[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()
  let query = supabase
    .from('people')
    .select('id, name, active, team_id, teams ( name )')
    .eq('partner_id', partner.id)
    .eq('active', true)
    .eq('kind', 'rep')
    .order('name')
    .limit(limit)

  const clean = term.replace(/[,()"\\%]/g, ' ').trim()
  if (clean) query = query.ilike('name', `%${clean}%`)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).map((p) => {
    const team = p.teams as { name?: string } | { name?: string }[] | null
    const t = Array.isArray(team) ? team[0] : team
    return {
      id: p.id as string,
      name: p.name as string,
      teamId: (p.team_id as string) ?? null,
      teamName: t?.name ?? null,
      active: Boolean(p.active),
    }
  })
}

/* -------------------------------------------------------------------------- */
/* The payable batch                                                            */
/* -------------------------------------------------------------------------- */

export async function listPayableBatch(): Promise<PayableLine[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('v_payable_batch')
    .select('*')
    .eq('partner_id', partner.id)
    .order('person_name')

  return (data ?? []).map(toPayableLine)
}

/**
 * Closed deals under a flat-fee partner still waiting on their one-time
 * approval — held out of listPayableBatch() above until someone approves
 * them. Same row shape as v_payable_batch, so the same mapper applies.
 */
export async function listCompAwaitingApproval(): Promise<PayableLine[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('v_comp_awaiting_approval')
    .select('*')
    .eq('partner_id', partner.id)
    .order('closed_at')

  return (data ?? []).map(toPayableLine)
}

export interface BatchPersonDeal {
  dealId: string
  clientName: string
  spiffAmount: number
  closedAt: string
}

/** The batch rolled up per person, which is how the transfer is actually paid.
 *  Each row also keeps its own contributing deals — a lump sum with nowhere
 *  to point back to is exactly what makes reconciling one hard. */
export function groupBatchByPerson(lines: PayableLine[]) {
  const map = new Map<
    string,
    {
      personId: string
      personName: string
      teamName: string | null
      amount: number
      deals: number
      lines: BatchPersonDeal[]
    }
  >()

  for (const line of lines) {
    const deal: BatchPersonDeal = {
      dealId: line.dealId,
      clientName: line.clientName,
      spiffAmount: line.spiffAmount,
      closedAt: line.closedAt,
    }
    const existing = map.get(line.personId)
    if (existing) {
      existing.amount += line.spiffAmount
      existing.deals += 1
      existing.lines.push(deal)
    } else {
      map.set(line.personId, {
        personId: line.personId,
        personName: line.personName,
        teamName: line.teamName,
        amount: line.spiffAmount,
        deals: 1,
        lines: [deal],
      })
    }
  }

  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

export function batchTotals(lines: PayableLine[]) {
  return lines.reduce(
    (acc, l) => ({
      spiff: acc.spiff + l.spiffAmount,
      comp: acc.comp + l.partnerComp,
      total: acc.total + l.spiffAmount + l.partnerComp,
      deals: acc.deals + 1,
    }),
    { spiff: 0, comp: 0, total: 0, deals: 0 },
  )
}
