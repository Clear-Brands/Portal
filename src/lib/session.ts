import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import type { Access, Role, SessionProfile } from '@/lib/auth/capabilities'

/**
 * The signed-in person, or null.
 *
 * Wrapped in React's `cache` so a page that asks five times in one render costs
 * one query. In the original, permissions were captured once at sign-in and
 * never refreshed, so granting or revoking access had no effect until the person
 * signed out and back in. This reads fresh on every request.
 */
export const getSession = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, role, access, partner_id, person_id, name, email, perms, people(active)')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data) return null

  const person = Array.isArray(data.people) ? data.people[0] : data.people

  return {
    id: data.id as string,
    userId: data.user_id as string,
    role: data.role as Role,
    access: data.access as Access,
    partnerId: (data.partner_id as string | null) ?? null,
    personId: (data.person_id as string | null) ?? null,
    name: data.name as string,
    email: data.email as string,
    perms: (data.perms as Record<string, boolean>) ?? {},
    // Internal staff and partner admins have no roster row and are always active.
    active: data.role === 'member' ? Boolean(person?.active) : true,
  }
})

/**
 * The three states a request can be in, distinguished so each gets an honest
 * screen rather than a generic error:
 *
 *   - no session          -> sign in
 *   - session, no profile -> "your login works, but you're not on the roster yet"
 *   - profile, paused     -> "your access is paused"
 */
export async function requireSession(): Promise<SessionProfile> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const profile = await getSession()
  if (!profile) redirect('/not-on-roster')
  if (!profile.active) redirect('/access-paused')

  return profile
}

export async function requireRole(...roles: Role[]): Promise<SessionProfile> {
  const profile = await requireSession()
  if (!roles.includes(profile.role)) redirect('/')
  return profile
}
