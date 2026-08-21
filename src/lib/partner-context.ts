import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'

import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { toPartner, type Partner } from '@/lib/types'

const COOKIE = 'cb_partner'

/**
 * Which partner program the current page is about.
 *
 * Clear Brands staff work across every partner and switch between them, so their
 * choice is kept in a cookie. Everyone else is pinned to their own — and pinned
 * by the database, not by this function: row-level security means a partner
 * admin who tampers with the cookie still reads nothing but their own rows.
 *
 * In the original, this was a module-global that persisted across partner
 * switches and even across role changes within a session.
 */
export const getActivePartner = cache(async (): Promise<Partner | null> => {
  const profile = await getSession()
  if (!profile) return null

  const supabase = await createClient()

  if (profile.role !== 'internal') {
    if (!profile.partnerId) return null
    const { data } = await supabase
      .from('partners')
      .select('*')
      .eq('id', profile.partnerId)
      .maybeSingle()
    return data ? toPartner(data) : null
  }

  const preferred = (await cookies()).get(COOKIE)?.value

  if (preferred) {
    const { data } = await supabase
      .from('partners')
      .select('*')
      .eq('id', preferred)
      .is('archived_at', null)
      .maybeSingle()
    if (data) return toPartner(data)
  }

  // Fall back to the first active partner rather than erroring — a Clear Brands
  // user should never land on a broken page because a cookie went stale.
  const { data } = await supabase
    .from('partners')
    .select('*')
    .is('archived_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle()

  return data ? toPartner(data) : null
})

/** Every partner a Clear Brands user can switch to. */
export const listSwitchablePartners = cache(async (): Promise<Partner[]> => {
  const profile = await getSession()
  if (profile?.role !== 'internal') return []

  const supabase = await createClient()
  const { data } = await supabase
    .from('partners')
    .select('*')
    .is('archived_at', null)
    .order('name')

  return (data ?? []).map(toPartner)
})

export async function setActivePartner(partnerId: string) {
  const store = await cookies()
  store.set(COOKIE, partnerId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  })
}

/** "Today" as the active partner experiences it, for date windows. */
export async function partnerToday(): Promise<string> {
  const partner = await getActivePartner()
  const timezone = partner?.timezone ?? 'America/New_York'

  // en-CA gives YYYY-MM-DD, which is what every date column expects.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
