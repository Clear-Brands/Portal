import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { toPartner, toRollup, type Partner, type PartnerRollup } from '@/lib/types'
import type { Access, Role } from '@/lib/auth/capabilities'

/**
 * Partner reads.
 *
 * `v_partner_rollup` already does the aggregation (payable, lifetime paid,
 * headcount, open and payable deal counts) — this module adds nothing beyond
 * paging and shaping it. See 0009_views.sql.
 */

export async function listPartnerRollups(): Promise<PartnerRollup[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_partner_rollup')
    .select('*')
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('name')

  if (error) throw new Error(`Could not load partners: ${error.message}`)
  return (data ?? []).map(toRollup)
}

export async function getPartnerById(id: string): Promise<Partner | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('partners').select('*').eq('id', id).maybeSingle()
  return data ? toPartner(data) : null
}

export interface PartnerLogin {
  id: string
  userId: string
  role: Role
  access: Access
  name: string
  email: string
  perms: Record<string, boolean>
  personId: string | null
  /** Free-text display title (0015) — e.g. "Director of Sales", "Accounting".
   *  Cosmetic only; never consulted by can()/has_cap(). */
  title: string | null
}

type Row = Record<string, unknown>

function toLogin(row: Row): PartnerLogin {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    role: row.role as Role,
    access: row.access as Access,
    name: row.name as string,
    email: row.email as string,
    perms: (row.perms as Record<string, boolean>) ?? {},
    personId: (row.person_id as string) ?? null,
    title: (row.title as string) ?? null,
  }
}

/** Every login (partner admin or member) that belongs to one partner. */
export async function listPartnerLogins(partnerId: string): Promise<PartnerLogin[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, role, access, name, email, perms, person_id, title')
    .eq('partner_id', partnerId)
    .order('role')
    .order('name')

  if (error) throw new Error(`Could not load logins: ${error.message}`)
  return (data ?? []).map(toLogin)
}

/** Every Clear Brands staff login, for the internal permissions grid. */
export async function listInternalLogins(): Promise<PartnerLogin[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, role, access, name, email, perms, person_id, title')
    .eq('role', 'internal')
    .order('access')
    .order('name')

  if (error) throw new Error(`Could not load the Clear Brands team: ${error.message}`)
  return (data ?? []).map(toLogin)
}
