import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the auth session on every request and keeps unauthenticated traffic
 * away from the portal.
 *
 * Next 16 renamed this convention from `middleware` to `proxy`; the behaviour is
 * unchanged.
 *
 * This is a gate, not the gate. Every page also checks its own session and every
 * query is filtered by row-level security — a proxy can be bypassed by a
 * misconfigured matcher, so it is never the only thing standing in the way.
 */
// /api/webhooks is its own namespace: every route under it authenticates a
// caller with a shared-secret header (see ghl-booking/route.ts), not a
// Supabase session, because the caller is a third-party service (GHL) that
// never logs in. Without this, the proxy below 307-redirects an
// unauthenticated POST to /login, /login has no POST handler, and the
// caller sees a 405 that has nothing to do with the actual request — which
// is exactly what happened here: GHL's webhook consistently failed with
// "405 Method Not Allowed" even though its Method dropdown was correctly
// set to POST, because the request never reached the webhook route at all.
// /accept-invite and /auth/set-session must also be reachable with no
// session: they're where someone lands straight out of an invite (or
// reset-password) email, before any cookie exists — accept-invite-form.tsx
// sets one via /auth/set-session as its first step. See the comment on that
// route for why this can't just reuse /auth/callback's ?code= flow.
// /signup is the same story for self-serve signup (src/app/signup/actions.ts):
// by definition nobody hitting it has a session yet.
const PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/auth/callback',
  '/auth/set-session',
  '/accept-invite',
  '/not-on-roster',
  '/access-paused',
  '/api/webhooks',
]

// getUser() below makes a real network call to Supabase's auth server, on
// almost every request to the site (see the matcher). A slow or hung
// connection there used to hang this proxy until Netlify's own edge runtime
// killed it — which is what a visitor sees as "This edge function has
// crashed / the edge function timed out", for every route, until it clears.
// Racing the call against a timeout means a Supabase hiccup degrades to
// "please sign in again" for that one request instead of taking the whole
// portal down.
const AUTH_CHECK_TIMEOUT_MS = 6000

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getUser(), not getSession(): this revalidates the token with the auth server
  // rather than trusting a cookie the browser handed us. Bounded so a stalled
  // call fails safe (treated as signed-out for this one request) instead of
  // hanging the whole function.
  const user = await Promise.race([
    supabase.auth.getUser().then(({ data }) => data.user),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), AUTH_CHECK_TIMEOUT_MS)),
  ]).catch(() => null)

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
}
