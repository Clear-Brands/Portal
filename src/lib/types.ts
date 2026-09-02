/**
 * Domain types.
 *
 * The Supabase client is left untyped and this module is the typed boundary:
 * every query lives in src/lib/data/*, returns one of these shapes, and nothing
 * outside that folder touches a raw row. `npm run db:types` regenerates full
 * database types from a running local stack when you want them, but the app does
 * not depend on that file existing.
 */

export const DEAL_STATUSES = ['submitted', 'in_talks', 'closed', 'paid', 'lost'] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]

/** What each status is called in front of a human. */
export const DEAL_STATUS_LABEL: Record<DealStatus, string> = {
  submitted: 'Submitted',
  in_talks: 'In talks',
  closed: 'Payable',
  paid: 'Paid',
  lost: 'Lost',
}

/** The order the pipeline reads in. */
export const PIPELINE_ORDER: DealStatus[] = ['submitted', 'in_talks', 'closed', 'paid', 'lost']

/** The known service checkboxes on the deal form. A deal can also carry a
 *  free-text service alongside these — "services" is just a text array, not
 *  an enum, so nothing here is enforced by the database. */
export const SERVICE_OPTIONS = ['SEO', 'Paid Ads', 'Web Design', 'LSA'] as const

export interface Deal {
  id: string
  partnerId: string
  personId: string
  personName: string
  teamName: string | null
  clientName: string
  company: string
  service: string
  services: string[]
  status: DealStatus
  spiffAmount: number
  partnerComp: number
  dealValue: number
  monthlyValue: number
  live: boolean | null
  contact: string
  phone: string
  email: string
  city: string
  state: string
  /** From the GHL booking form's "Number of employees " question. Null when
   *  unknown or unanswered — never 0, which would read as a real answer. */
  employeeCount: number | null
  promoNote: string
  lostReason: string
  churnNote: string
  churnedAt: string | null
  closedAt: string | null
  lostAt: string | null
  payoutId: string | null
  createdAt: string
}

export interface Partner {
  id: string
  name: string
  slug: string
  timezone: string
  defaultSpiff: number
  revsharePct: number
  compMode: 'none' | 'flat' | 'pct' | 'ongoing_pct'
  compFlat: number
  compPct: number
  compBasis: 'first_month' | 'contract'
  dealsEnabled: boolean
  spiffsEnabled: boolean
  revshareEnabled: boolean
  competitionsEnabled: boolean
  annualEnabled: boolean
  selfServeDealsEnabled: boolean
  brandAccent: string
  archivedAt: string | null
}

export interface PartnerAsset {
  id: string
  partnerId: string
  title: string
  storagePath: string
  fileSize: number
  uploadedByName: string | null
  createdAt: string
}

export function toPartnerAsset(row: Row): PartnerAsset {
  return {
    id: row.id as string,
    partnerId: row.partner_id as string,
    title: row.title as string,
    storagePath: row.storage_path as string,
    fileSize: num(row.file_size),
    uploadedByName: (row.uploaded_by_name as string) ?? null,
    createdAt: row.created_at as string,
  }
}

export interface PartnerRollup {
  partnerId: string
  name: string
  archivedAt: string | null
  payableNow: number
  lifetimePaid: number
  activePeople: number
  totalPeople: number
  teamCount: number
  openDeals: number
  payableDeals: number
}

export interface PayableLine {
  dealId: string
  clientName: string
  personId: string
  personName: string
  personEmail: string
  teamId: string | null
  teamName: string | null
  spiffAmount: number
  partnerComp: number
  closedAt: string
  /** True for a deal closed under 'ongoing_pct' comp — approving it opts the
   *  deal into the rev-share programme (deals.live = true) instead of, or
   *  alongside, a one-time company payout line (which is always 0 here). */
  ongoingRevshare: boolean
  monthlyValue: number
  /** The partner's rate at read time — display only, exactly like every other
   *  number on this line; record_revshare() computes the real total fresh. */
  revsharePct: number
}

export interface Payout {
  id: string
  partnerId: string
  paidDate: string
  period: string
  reference: string
  total: number
  spiffTotal: number
  compTotal: number
  voidedAt: string | null
  voidReason: string
  createdAt: string
}

export interface PayoutLine {
  id: string
  payoutId: string
  dealId: string | null
  personId: string | null
  kind: 'spiff' | 'company'
  amount: number
  personName: string
  teamName: string
  clientName: string
}

export interface TeamOption {
  id: string
  name: string
  color: string
}

export interface PersonOption {
  id: string
  name: string
  teamId: string | null
  teamName: string | null
  active: boolean
}

/** A page of rows plus what the caller needs to render a pager. */
export interface Page<T> {
  rows: T[]
  total: number
  page: number
  perPage: number
  pageCount: number
}

/* -------------------------------------------------------------------------- */
/* Row mappers — the one place a database column name becomes a domain field.  */
/* -------------------------------------------------------------------------- */

type Row = Record<string, unknown>

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

export function toDeal(row: Row): Deal {
  const person = row.people as Row | Row[] | null
  const p = Array.isArray(person) ? person[0] : person
  const team = p?.teams as Row | Row[] | null | undefined
  const t = Array.isArray(team) ? team[0] : team

  return {
    id: row.id as string,
    partnerId: row.partner_id as string,
    personId: row.person_id as string,
    personName: (p?.name as string) ?? '',
    teamName: (t?.name as string) ?? null,
    clientName: row.client_name as string,
    company: (row.company as string) ?? '',
    service: (row.service as string) ?? '',
    services: (row.services as string[] | null) ?? [],
    status: row.status as DealStatus,
    spiffAmount: num(row.spiff_amount),
    partnerComp: num(row.partner_comp),
    dealValue: num(row.deal_value),
    monthlyValue: num(row.monthly_value),
    live: (row.live as boolean | null) ?? null,
    contact: (row.contact as string) ?? '',
    phone: (row.phone as string) ?? '',
    email: (row.email as string) ?? '',
    city: (row.city as string) ?? '',
    state: (row.state as string) ?? '',
    employeeCount: (row.employee_count as number | null) ?? null,
    promoNote: (row.promo_note as string) ?? '',
    lostReason: (row.lost_reason as string) ?? '',
    churnNote: (row.churn_note as string) ?? '',
    churnedAt: (row.churned_at as string) ?? null,
    closedAt: (row.closed_at as string) ?? null,
    lostAt: (row.lost_at as string) ?? null,
    payoutId: (row.payout_id as string) ?? null,
    createdAt: row.created_at as string,
  }
}

export function toPartner(row: Row): Partner {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    timezone: row.timezone as string,
    defaultSpiff: num(row.default_spiff),
    revsharePct: num(row.revshare_pct),
    compMode: row.comp_mode as Partner['compMode'],
    compFlat: num(row.comp_flat),
    compPct: num(row.comp_pct),
    compBasis: row.comp_basis as Partner['compBasis'],
    dealsEnabled: row.deals_enabled !== false,
    spiffsEnabled: row.spiffs_enabled !== false,
    revshareEnabled: row.revshare_enabled !== false,
    competitionsEnabled: row.competitions_enabled !== false,
    annualEnabled: row.annual_enabled !== false,
    selfServeDealsEnabled: row.self_serve_deals_enabled !== false,
    brandAccent: (row.brand_accent as string) ?? '#C8F52F',
    archivedAt: (row.archived_at as string) ?? null,
  }
}

export function toRollup(row: Row): PartnerRollup {
  return {
    partnerId: row.partner_id as string,
    name: row.name as string,
    archivedAt: (row.archived_at as string) ?? null,
    payableNow: num(row.payable_now),
    lifetimePaid: num(row.lifetime_paid),
    activePeople: num(row.active_people),
    totalPeople: num(row.total_people),
    teamCount: num(row.team_count),
    openDeals: num(row.open_deals),
    payableDeals: num(row.payable_deals),
  }
}

export function toPayableLine(row: Row): PayableLine {
  return {
    dealId: row.deal_id as string,
    clientName: row.client_name as string,
    personId: row.person_id as string,
    personName: row.person_name as string,
    personEmail: row.person_email as string,
    teamId: (row.team_id as string) ?? null,
    teamName: (row.team_name as string) ?? null,
    spiffAmount: num(row.spiff_amount),
    partnerComp: num(row.partner_comp),
    closedAt: row.closed_at as string,
    ongoingRevshare: Boolean(row.ongoing_revshare),
    monthlyValue: num(row.monthly_value),
    revsharePct: num(row.revshare_pct),
  }
}

export function toPayout(row: Row): Payout {
  return {
    id: row.id as string,
    partnerId: row.partner_id as string,
    paidDate: row.paid_date as string,
    period: row.period as string,
    reference: row.reference as string,
    total: num(row.total),
    spiffTotal: num(row.spiff_total),
    compTotal: num(row.comp_total),
    voidedAt: (row.voided_at as string) ?? null,
    voidReason: (row.void_reason as string) ?? '',
    createdAt: row.created_at as string,
  }
}

export function toPayoutLine(row: Row): PayoutLine {
  return {
    id: row.id as string,
    payoutId: row.payout_id as string,
    dealId: (row.deal_id as string) ?? null,
    personId: (row.person_id as string) ?? null,
    kind: row.kind as PayoutLine['kind'],
    amount: num(row.amount),
    personName: (row.person_name as string) ?? '',
    teamName: (row.team_name as string) ?? '',
    clientName: (row.client_name as string) ?? '',
  }
}
