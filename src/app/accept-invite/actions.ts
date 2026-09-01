'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

export type AcceptInviteState = { error?: string }

const NewPassword = z.object({
  password: z.string().min(8, 'Use at least 8 characters'),
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
 */
export async function setInitialPassword(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = NewPassword.safeParse({ password: formData.get('password') })

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

  redirect('/')
}
