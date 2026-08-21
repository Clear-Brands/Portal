'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * Password sign-in is the everyday path; the magic link is kept for invitations
 * and resets.
 *
 * The original was passwordless only, which means an email on every single
 * login. Supabase's built-in auth mail is rate-limited to a couple of messages
 * an hour and explicitly not for production, so at 500 users that is the first
 * thing that breaks — on any plan. It is also poor on a phone, where a rep
 * checking their earnings gets bounced through an inbox into the wrong browser.
 *
 * Both actions below are throttled per email (stops someone hammering one
 * account) and per IP (stops one script trying many). See src/lib/rate-limit.ts
 * for what this does and does not guarantee.
 */

const Credentials = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
})

const EmailOnly = z.object({
  email: z.email('Enter a valid email address'),
})

export type AuthState = { error?: string; sent?: boolean }

/** The original request's IP, best-effort — there is no client to spoof this
 *  against here, since it only ever throttles, never authorises. */
async function requestIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'unknown'
}

const TOO_MANY_ATTEMPTS = 'Too many attempts. Wait a few minutes and try again.'

export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = Credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again' }
  }

  const ip = await requestIp()
  const byEmail = checkRateLimit(`login:email:${parsed.data.email.toLowerCase()}`, 8, 15 * 60)
  const byIp = checkRateLimit(`login:ip:${ip}`, 30, 15 * 60)
  if (!byEmail.allowed || !byIp.allowed) {
    return { error: TOO_MANY_ATTEMPTS }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    // Deliberately does not distinguish "no such account" from "wrong password":
    // that difference tells an attacker which addresses are real.
    return { error: 'That email and password do not match. Try again, or use a sign-in link.' }
  }

  // Only ever redirect to a path on this origin — the startsWith guard is what
  // keeps this from becoming an open redirect.
  const next = parsed.data.next
  const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
  redirect(destination)
}

export async function sendSignInLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = EmailOnly.safeParse({ email: formData.get('email') })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Enter a valid email address' }
  }

  const ip = await requestIp()
  const byEmail = checkRateLimit(`otp:email:${parsed.data.email.toLowerCase()}`, 4, 15 * 60)
  const byIp = checkRateLimit(`otp:ip:${ip}`, 15, 15 * 60)
  if (!byEmail.allowed || !byIp.allowed) {
    return { error: TOO_MANY_ATTEMPTS }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: false, // Only people already on the roster get a link.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    return { error: 'We could not send that link right now. Try again in a moment.' }
  }

  // Always reports success, whether or not the address exists — otherwise this
  // form becomes a way to enumerate who works there.
  return { sent: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
