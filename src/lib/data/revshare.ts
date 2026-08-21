import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getActivePartner } from '@/lib/partner-context'

/**
 * Rev share reads.
 *
 * `record_revshare()` in 0010_rpcs.sql computes the statement total in SQL from
 * whichever deal ids it is given — that is the number that actually gets
 * recorded. The "accruing total" here is display-only, exactly like
 * `batchTotals()` for payouts: a plain sum over an already-fetched, realistically
 * small list of a partner's live accounts, shown before anything is recorded.
 */

type Row = Record<string, unknown>

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

export interface LiveAccount {
  dealId: string
  clientName: string
  personId: string
  personName: string
  teamName: string | null
  monthlyValue: number
  /** true = live, null = not yet marked either way, false never appears here. */
  live: boolean | null
  closedAt: string | null
}

function toLiveAccount(row: Row): LiveAccount {
  const person = row.people as Row | Row[] | null
  const p = Array.isArray(person) ? person[0] : person
  const team = p?.teams as Row | Row[] | null | undefined
  const t = Array.isArray(team) ? team[0] : team

  return {
    dealId: row.id as string,
    clientName: row.client_name as string,
    personId: row.person_id as string,
    personName: (p?.name as string) ?? '',
    teamName: (t?.name as string) ?? null,
    monthlyValue: num(row.monthly_value),
    live: (row.live as boolean | null) ?? null,
    closedAt: (row.closed_at as string) ?? null,
  }
}

/** Deals with monthly_value > 0 and live is not false — the programme itself. */
export async function listLiveAccounts(): Promise<LiveAccount[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('deals')
    .select('id, client_name, person_id, monthly_value, live, closed_at, people(name, teams(name))')
    .eq('partner_id', partner.id)
    .gt('monthly_value', 0)
    .or('live.is.null,live.eq.true')
    .order('client_name')

  return (data ?? []).map(toLiveAccount)
}

/** Display total, computed the same way `batchTotals` is for payouts. */
export function accruingTotal(accounts: LiveAccount[]): number {
  return accounts.reduce((sum, a) => sum + a.monthlyValue, 0)
}

/** Closed or paid deals not yet opted into the programme, for "add a client". */
export async function listRevshareCandidates(limit = 200): Promise<
  { dealId: string; clientName: string; personName: string; closedAt: string | null }[]
> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('deals')
    .select('id, client_name, closed_at, people(name)')
    .eq('partner_id', partner.id)
    .in('status', ['closed', 'paid'])
    .eq('monthly_value', 0)
    .order('closed_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as Row[]).map((row) => {
    const person = row.people as Row | Row[] | null
    const p = Array.isArray(person) ? person[0] : person
    return {
      dealId: row.id as string,
      clientName: row.client_name as string,
      personName: (p?.name as string) ?? '',
      closedAt: (row.closed_at as string) ?? null,
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Statements                                                                  */
/* -------------------------------------------------------------------------- */

export interface RevshareStatement {
  id: string
  partnerId: string
  period: string
  pct: number
  base: number
  total: number
  reference: string
  voidedAt: string | null
  voidReason: string
  createdAt: string
}

function toStatement(row: Row): RevshareStatement {
  return {
    id: row.id as string,
    partnerId: row.partner_id as string,
    period: row.period as string,
    pct: num(row.pct),
    base: num(row.base),
    total: num(row.total),
    reference: row.reference as string,
    voidedAt: (row.voided_at as string) ?? null,
    voidReason: (row.void_reason as string) ?? '',
    createdAt: row.created_at as string,
  }
}

export interface RevshareLine {
  id: string
  statementId: string
  dealId: string | null
  clientName: string
  monthlyValue: number
  share: number
}

function toLine(row: Row): RevshareLine {
  return {
    id: row.id as string,
    statementId: row.statement_id as string,
    dealId: (row.deal_id as string) ?? null,
    clientName: (row.client_name as string) ?? '',
    monthlyValue: num(row.monthly_value),
    share: num(row.share),
  }
}

export interface StatementWithLines extends RevshareStatement {
  lines: RevshareLine[]
}

/** History, with each statement's own line items attached — one bounded pair of
 *  queries rather than one round trip per statement. */
export async function listRevshareStatements(limitMonths = 24): Promise<StatementWithLines[]> {
  const partner = await getActivePartner()
  if (!partner) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('revshare_statements')
    .select('*')
    .eq('partner_id', partner.id)
    .order('period', { ascending: false })
    .limit(limitMonths)

  const statements = (data ?? []).map(toStatement)
  if (statements.length === 0) return []

  const { data: lineRows } = await supabase
    .from('revshare_lines')
    .select('*')
    .in('statement_id', statements.map((s) => s.id))
    .order('share', { ascending: false })

  const byStatement = new Map<string, RevshareLine[]>()
  for (const row of (lineRows ?? []) as Row[]) {
    const id = row.statement_id as string
    byStatement.set(id, [...(byStatement.get(id) ?? []), toLine(row)])
  }

  return statements.map((s) => ({ ...s, lines: byStatement.get(s.id) ?? [] }))
}

/** Lifetime total and whether the current month already has a live statement. */
export async function revshareHeadline(): Promise<{
  lifetimeTotal: number
  statementsRecorded: number
  thisPeriodRecorded: RevshareStatement | null
}> {
  const partner = await getActivePartner()
  if (!partner) return { lifetimeTotal: 0, statementsRecorded: 0, thisPeriodRecorded: null }

  const supabase = await createClient()

  const [{ data: totalRows }, { data: latest }, { count }] = await Promise.all([
    // Statements are monthly, so even decades of history is a small, bounded
    // fetch — capped explicitly rather than left open-ended. Same display-only
    // carve-out as `batchTotals` for payouts: this number is never what gets
    // recorded, `record_revshare()` computes that fresh in SQL.
    supabase
      .from('revshare_statements')
      .select('total')
      .eq('partner_id', partner.id)
      .is('voided_at', null)
      .limit(600),
    supabase
      .from('revshare_statements')
      .select('*')
      .eq('partner_id', partner.id)
      .is('voided_at', null)
      .order('period', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('revshare_statements')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', partner.id)
      .is('voided_at', null),
  ])

  const lifetimeTotal = ((totalRows ?? []) as Row[]).reduce((sum, r) => sum + num(r.total), 0)
  const latestStatement = latest ? toStatement(latest) : null

  return {
    lifetimeTotal,
    statementsRecorded: count ?? 0,
    thisPeriodRecorded: latestStatement,
  }
}
