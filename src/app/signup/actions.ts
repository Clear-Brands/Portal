'use server'

import { headers } from 'next/headers'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { notifyClearBrands } from '@/lib/notify'

/**
 * Public self-serve signup — no session required. Per Cristian's request: a
 * rep or partner admin can create their own portal credentials, matched to a
 * partner purely by their email's domain (partners.signup_domains, set from
 * Partner Settings). If no partner has that domain configured, account
 * creation is refused outright rather than left ownerless.
 *
 * Runs entirely on the admin client — there is no session yet to scope a
 * session-bound client to, so this is one of the sanctioned uses of
 * createAdminClient() (see the comment on that function): creating an auth
 * account, plus the two rows (people, profiles) every other invite path
 * already creates alongside one. The one step that deliberately does NOT use
 * the admin client is `supabase.auth.signUp()` itself — that runs on the
 * ordinary cookie-bound client so it behaves exactly like a normal client-side
 * signup, including sending Supabase's own "confirm your email" mail through
 * the project's already-configured custom SMTP. No new mailer for that part.
 *
 * The new account lands as an ordinary rep (role: 'member', access: 'none',
 * no pod) — the same starting point a CSV-imported or manually-added rep
 * gets today. Cristian's ask was for Clear Brands to be notified afterward so
 * they can promote the login to partner admin or assign a pod; that email
 * goes out via notify.ts, and the roster's "Promote to partner admin" action
 * (src/lib/actions/roster.ts) and existing "Edit -> Pod" action cover the
 * two follow-ups.
 */

const SignUp = z.object({
  name: z.string().trim().min(1, 'A name is required').max(160),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
  confirmPassword: z.string(),
})

export type SignUpState = { error?: string; ok?: boolean }

async function requestIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? 'unknown'
}

const TOO_MANY_ATTEMPTS = 'Too many attempts. Wait a while and try again.'

// Deliberately the same message whether the email belongs to someone who
// already has a login here, or to someone else entirely — same reasoning as
// signInWithPassword in src/app/login/actions.ts: this can't become a way to
// probe who already has an account.
const GENERIC_EXISTING =
  'If an account already exists for that email, check your inbox for the original link — or try signing in.'

export async function selfSignUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = SignUp.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    return { error: 'Passwords do not match.' }
  }

  const email = parsed.data.email.toLowerCase()
  const domain = email.split('@')[1] ?? ''

  const ip = await requestIp()
  const byEmail = checkRateLimit(`signup:email:${email}`, 4, 60 * 60)
  const byIp = checkRateLimit(`signup:ip:${ip}`, 12, 60 * 60)
  if (!byEmail.allowed || !byIp.allowed) {
    return { error: TOO_MANY_ATTEMPTS }
  }

  const admin = createAdminClient()

  const { data: matches } = await admin
    .from('partners')
    .select('id, name')
    .is('archived_at', null)
    .contains('signup_domains', [domain])

  const partner = (matches ?? [])[0] as { id: string; name: string } | undefined
  if (!partner) {
    return {
      error:
        "We don't recognize that email's company yet. Ask Clear Brands to turn on self-serve signup for your company, or have them add you to the roster directly.",
    }
  }

  // Reuse an existing roster row rather than creating a duplicate — common
  // when Clear Brands already imported this person by CSV but hasn't sent
  // them a login invite yet.
  const { data: existingPerson } = await admin
    .from('people')
    .select('id')
    .eq('partner_id', partner.id)
    .eq('email', email)
    .maybeSingle()

  if (existingPerson) {
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('person_id', existingPerson.id)
      .maybeSingle()
    if (existingProfile) return { error: GENERIC_EXISTING }
  }

  const supabase = await createClient()
  const { data: signedUp, error: signUpError } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  })

  if (signUpError || !signedUp.user) {
    return { error: 'Could not create that account right now. Try again in a moment.' }
  }

  // Supabase reports an email that already has an account this way — an
  // empty identities array, no error — specifically so this response can't
  // be used to enumerate who's already signed up. Same handling here.
  if (signedUp.user.identities && signedUp.user.identities.length === 0) {
    return { error: GENERIC_EXISTING }
  }

  let personId = existingPerson?.id as string | undefined

  if (!personId) {
    const { data: person, error: personError } = await admin
      .from('people')
      .insert({
        partner_id: partner.id,
        name: parsed.data.name,
        email,
        kind: 'rep',
        active: true,
      })
      .select('id')
      .single()

    if (personError || !person) {
      await admin.auth.admin.deleteUser(signedUp.user.id)
      return { error: 'Could not finish setting up your account. Try again, or ask Clear Brands for help.' }
    }
    personId = person.id as string
  }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: signedUp.user.id,
    partner_id: partner.id,
    person_id: personId,
    role: 'member',
    access: 'none',
    name: parsed.data.name,
    email,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(signedUp.user.id)
    if (!existingPerson) await admin.from('people').delete().eq('id', personId)
    return { error: 'Could not finish setting up your account. Try again, or ask Clear Brands for help.' }
  }

  await notifyClearBrands(
    `New self-serve signup: ${parsed.data.name} (${partner.name})`,
    `<p><strong>${escapeHtml(parsed.data.name)}</strong> (${escapeHtml(email)}) just created their own portal login, matched to <strong>${escapeHtml(partner.name)}</strong> by email domain.</p>
     <p>They're in as a rep with no pod assigned yet. From the roster you can assign their pod, or promote them to partner admin if that's who they are.</p>
     <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/roster">Open the roster</a></p>`,
  )

  return { ok: true }
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return s.replace(/[&<>"']/g, (c) => map[c]!)
}
