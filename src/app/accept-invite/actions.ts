'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

export type AcceptInviteState = { error?: string }

const NewPassword = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords don’t match',
    path: ['confirmPassword'],
  })

/**
 * Sets the password for whoever the current session cookie belongs to.
 *
 * Only reachable with a session at all because /accept-invite's client
 * component put one there first, via /auth/set-session, from the tokens on
 * an invite link. If that never happened — link already used, expired, or
 * this page loaded with no fragment to begin with — getUser() comes back
 * empty and this reports the same "ask for a new invite" story rather than
 * a confusing generic error.
 *
 * Where it sends people afterward differs by flow. A `recovery` (reset
 * password) always lands on `/` — Charles confirmed that one's fine as-is.
 * An `invite` for a brand-new partner admin instead goes to `/revshare`
 * (Charles, Sept 2: "the welcome link should take us to Partner admin page
 * once logged on" — clarified as the Rev share tab specifically). Any other
 * invite (an internal login, a rep's roster invite) falls back to `/`,
 * since `/revshare` isn't even in a member's nav.
 */
export async function setInitialPassword(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = NewPassword.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a password' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'That invite link has expired or was already used. Ask for a new one.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return { error: 'Could not set your password. Try again.' }
  }

  if (formData.get('flow') === 'invite') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profile?.role === 'partner_admin') redirect('/revshare')
  }

  redirect('/')
}
