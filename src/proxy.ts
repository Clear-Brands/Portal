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
const PUBLIC_PATHS = ['/login', '/auth/callback', '/not-on-roster', '/access-paused', '/api/webhooks']

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
  // rather than trusting a cookie the browser handed us.
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
