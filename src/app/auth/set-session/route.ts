import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

/**
 * Establishes a cookie session from tokens the browser pulled out of a
 * Supabase auth link's URL fragment (#access_token=...&refresh_token=...).
 *
 * Why this exists: invite and password-recovery links are generated for a
 * device that never made a request (the recipient's browser, opening an
 * email), so PKCE's code-exchange flow doesn't apply — Supabase's own verify
 * endpoint redirects those back to us with the session in the URL *fragment*
 * instead of a `?code=` query param. A fragment never reaches a server; only
 * client-side JS can see it. This app deliberately ships no browser Supabase
 * client (see src/lib/supabase/server.ts) — all data access is server-side
 * so RLS actually applies — so the fragment can't just be handed to a
 * browser SDK and swapped for a session the normal way either.
 *
 * This route is the narrow exception: the client page that owns the
 * fragment (see /accept-invite) POSTs the two opaque tokens here, and the
 * *server* client's own setSession() validates them against Supabase and
 * writes the resulting sb-* cookies onto this response — the same cookie
 * plumbing every other server action already uses. The browser never gets
 * write access to anything; it only ever relays two strings it already had.
 */

const Tokens = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
})

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = Tokens.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing or malformed session tokens.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.setSession({
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token,
  })

  if (error) {
    return NextResponse.json(
      { error: 'That link has expired or was already used. Ask for a new invite.' },
      { status: 401 },
    )
  }

  return NextResponse.json({ ok: true })
}
