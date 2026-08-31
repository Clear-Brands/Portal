import { randomUUID, timingSafeEqual } from 'crypto'

import type { NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * Turns a GHL discovery-call booking into a deal under the referring rep's
 * name — the automatic half of what "Book a discovery call" on My deals
 * promises. The manual "Submit a deal" form stays as the fallback for when
 * this can't find a match; it never runs instead of this.
 *
 * No session exists here — GHL calls this directly — so two things a normal
 * server action gets for free have to be built by hand: authentication (a
 * shared secret header, checked in constant time) and idempotency (GHL can
 * and does redeliver a webhook; `webhook_events`'s unique (source,
 * idempotency_key) constraint is what makes a redelivery a no-op instead of
 * a second deal).
 *
 * The request body is a JSON object this route defines the shape of — set up
 * as custom data on the GHL workflow's webhook action, not GHL's raw
 * trigger payload, so the contract lives here rather than in whatever GHL
 * happens to send:
 *
 *   {
 *     "contact_id":   "{{contact.id}}",           // required — the idempotency key
 *     "first_name":   "{{contact.first_name}}",
 *     "last_name":    "{{contact.last_name}}",
 *     "email":        "{{contact.email}}",
 *     "phone":        "{{contact.phone}}",
 *     "company_name": "{{contact.company_name}}",
 *     "city":         "{{contact.city}}",
 *     "state":        "{{contact.state}}",
 *     "notes":        "{{contact.notes}}",         // whichever field carries it
 *     "rep_email":    "{{contact.rep_email}}"      // the hidden field carrying attribution
 *   }
 *
 * The partner is which My deals booking link this came from, not something
 * GHL can be trusted to declare on its own — it's a query-string slug on the
 * webhook URL itself: .../api/webhooks/ghl-booking?partner=fieldpulse
 *
 * GHL's workflow "Webhook" action lets you pick a Method in its own UI, but
 * in practice the outbound request doesn't reliably honor that choice — a
 * live test against this route saw a POST-configured action arrive as a
 * GET twice in a row, immediately after re-selecting and re-saving "POST".
 * Rather than fight GHL's builder further, this route accepts either verb:
 * POST reads the payload from the JSON body as documented above, GET reads
 * the identical shape from the URL's query string (?contact_id=...&rep_
 * email=...), and both funnel into the same handler below.
 */

type BookingPayload = {
  contact_id?: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  company_name?: string
  city?: string
  state?: string
  notes?: string
  rep_email?: string
}

function secretMatches(request: NextRequest): boolean {
  const expected = process.env.GHL_WEBHOOK_SECRET ?? ''
  const provided = request.headers.get('x-ghl-webhook-secret') ?? ''
  if (!expected) return false

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!secretMatches(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: BookingPayload
  try {
    body = (await request.json()) as BookingPayload
  } catch {
    return Response.json({ error: 'Body was not valid JSON' }, { status: 400 })
  }

  return handleBooking(request, body)
}

// See the file-level comment above: GHL's Webhook action has been observed
// firing a GET despite the action being configured and saved as POST, so
// this is a second, equally-trusted entry point rather than a fallback for
// misconfiguration. A GET carries no body, so the same fields are read from
// the query string instead — everything after ?partner=... on the webhook
// URL that isn't `partner` itself.
export async function GET(request: NextRequest) {
  if (!secretMatches(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const body: BookingPayload = {
    contact_id: params.get('contact_id') ?? undefined,
    first_name: params.get('first_name') ?? undefined,
    last_name: params.get('last_name') ?? undefined,
    email: params.get('email') ?? undefined,
    phone: params.get('phone') ?? undefined,
    company_name: params.get('company_name') ?? undefined,
    city: params.get('city') ?? undefined,
    state: params.get('state') ?? undefined,
    notes: params.get('notes') ?? undefined,
    rep_email: params.get('rep_email') ?? undefined,
  }

  return handleBooking(request, body)
}

async function handleBooking(request: NextRequest, body: BookingPayload) {
  const partnerSlug = request.nextUrl.searchParams.get('partner') ?? ''
  if (!partnerSlug) {
    return Response.json({ error: 'Missing ?partner= on the webhook URL' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Every delivery is stored raw first, whatever happens next — a mapping bug
  // is then replayable from this row instead of forensic. GHL redelivers
  // webhooks on a non-2xx or a timeout; the unique constraint on
  // (source, idempotency_key) turns that redelivery into a no-op here rather
  // than a second deal.
  const idempotencyKey = body.contact_id?.trim() || `no-contact-id:${randomUUID()}`

  const { data: eventRow, error: insertEventError } = await admin
    .from('webhook_events')
    .insert({
      source: 'ghl_booking',
      idempotency_key: idempotencyKey,
      payload: body,
      status: 'received',
    })
    .select('id')
    .single()

  if (insertEventError) {
    // Unique violation = we've already seen this exact delivery. Ack it and
    // stop — the first delivery already did (or is doing) the real work.
    if (insertEventError.code === '23505') {
      return Response.json({ ok: true, duplicate: true })
    }
    return Response.json({ error: 'Could not record the webhook' }, { status: 500 })
  }
  if (!eventRow) {
    return Response.json({ error: 'Could not record the webhook' }, { status: 500 })
  }
  const eventId = eventRow.id

  async function fail(reason: string) {
    await admin.from('webhook_events').update({ status: 'error', error: reason }).eq('id', eventId)
    // Still 200: this is a data problem (unknown partner, no matching rep),
    // not a delivery problem — GHL retrying won't fix it, so don't ask it to.
    return Response.json({ ok: false, reason })
  }

  const { data: partner } = await admin
    .from('partners')
    .select('id, default_spiff')
    .eq('slug', partnerSlug)
    .is('archived_at', null)
    .maybeSingle()

  if (!partner) return fail(`No active partner with slug "${partnerSlug}"`)

  const repEmail = body.rep_email?.trim().toLowerCase()
  if (!repEmail) return fail('Booking carried no rep_email')

  // "Make it so that when a rep submits a deal and they aren't already in
  // the portal it auto sends them an invite to create a password/account."
  // (Aug 2026 edit doc, High Priority.) A rep who clicks their own booking
  // link before Clear Brands has added them to the roster — or who's on the
  // roster but was never given a login — is the normal case this is for, not
  // a typo: GHL only ever sends an email it read off the rep's own hidden
  // field. ensureRepAccount() covers both: create the person if they're
  // wholly new, invite them if they don't have a login yet, and never block
  // the deal itself over invite plumbing (it always returns the person as
  // long as one exists or was created — only null if the match is a
  // deliberately deactivated rep, or the new person row couldn't be made).
  const person = await ensureRepAccount(admin, partner.id, repEmail)
  if (!person) return fail(`No active rep at ${partnerSlug} matches "${repEmail}", and auto-invite failed`)

  const clientName = [body.first_name, body.last_name].filter(Boolean).join(' ').trim() || 'Discovery call booking'

  const { data: deal, error: dealError } = await admin
    .from('deals')
    .insert({
      partner_id: partner.id,
      person_id: person.id,
      client_name: clientName,
      company: body.company_name?.trim() ?? '',
      email: body.email?.trim() ?? '',
      phone: body.phone?.trim() ?? '',
      city: body.city?.trim() ?? '',
      state: (body.state ?? '').trim().slice(0, 2).toUpperCase(),
      promo_note: body.notes?.trim() ?? '',
      status: 'submitted',
      spiff_amount: partner.default_spiff,
    })
    .select('id')
    .single()

  if (dealError || !deal) return fail(`Could not create the deal: ${dealError?.message ?? 'unknown error'}`)

  await admin
    .from('webhook_events')
    .update({ status: 'processed', processed_at: new Date().toISOString() })
    .eq('id', eventId)

  return Response.json({ ok: true, dealId: deal.id })
}

/**
 * Find, create, or invite the rep this booking belongs to. Three cases:
 *
 *   1. An active person with this email already has a portal login — return
 *      them as-is, nothing to do.
 *   2. An active person with this email exists but has never logged in
 *      (added to the roster without "create a login" checked, or via CSV
 *      import) — send them the same invite "Send login invite" on their
 *      roster row would.
 *   3. No person with this email exists at all for this partner — this is a
 *      brand-new rep clicking their own booking link before anyone at Clear
 *      Brands added them. Create the roster row, then invite as in case 2.
 *
 * A person who exists but is `active = false` is a deliberate Clear Brands
 * decision (see setPersonActive) — a webhook is never the thing that
 * reverses that, so that case returns null and the caller fails the event
 * exactly like the old "no active rep matches" behaviour.
 *
 * The deal itself is the one thing this must not lose to invite plumbing:
 * once a person row exists (found or created), this always returns it, even
 * if the auth invite or the profiles insert fails — Clear Brands can always
 * send the login invite by hand afterward from the roster.
 */
async function ensureRepAccount(
  admin: AdminClient,
  partnerId: string,
  email: string,
): Promise<{ id: string } | null> {
  const { data: existing } = await admin
    .from('people')
    .select('id, name, active')
    .eq('partner_id', partnerId)
    .ilike('email', email)
    .maybeSingle()

  if (existing && !existing.active) return null

  let personId: string
  let personName: string

  if (existing) {
    personId = existing.id
    personName = existing.name as string
  } else {
    personName = nameFromEmail(email)
    const { data: created, error } = await admin
      .from('people')
      .insert({ partner_id: partnerId, name: personName, email, kind: 'rep', active: true })
      .select('id, name')
      .single()
    if (error || !created) return null
    personId = created.id
    personName = created.name
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('person_id', personId)
    .maybeSingle()
  if (profile) return { id: personId }

  const { data: createdUser, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
  })
  if (inviteError || !createdUser.user) return { id: personId }

  const { error: profileError } = await admin.from('profiles').insert({
    user_id: createdUser.user.id,
    partner_id: partnerId,
    person_id: personId,
    role: 'member',
    access: 'none',
    name: personName,
    email,
  })
  // Don't leave an auth account nothing points at — same rule roster.ts
  // follows for every other invite path.
  if (profileError) await admin.auth.admin.deleteUser(createdUser.user.id)

  return { id: personId }
}

/** A best-effort display name from the local part of an email, e.g.
 *  "jane.doe" -> "Jane Doe" — good enough to identify the rep in the roster
 *  until someone corrects it there; never blocks anything on being wrong. */
function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  const words = local.split(/[._+-]+/).filter(Boolean)
  if (words.length === 0) return email
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
