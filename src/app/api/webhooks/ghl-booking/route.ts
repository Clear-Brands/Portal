import { randomUUID, timingSafeEqual } from 'crypto'

import type { NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

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

  const { data: person } = await admin
    .from('people')
    .select('id')
    .eq('partner_id', partner.id)
    .ilike('email', repEmail)
    .eq('active', true)
    .maybeSingle()

  if (!person) return fail(`No active rep at ${partnerSlug} matches "${repEmail}"`)

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
