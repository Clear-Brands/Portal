import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * A Supabase client bound to the signed-in user's session.
 *
 * Every read and write through this client is subject to row-level security as
 * that user. This is the client almost everything should use.
 *
 * Note what does not exist in this codebase: a browser Supabase client with
 * write access. In the original build the anon key shipped in the page source
 * and the browser talked to PostgREST directly, which is why a rep could post a
 * referral with any spiff amount they liked. Here the browser holds a session
 * cookie and nothing else; all data access happens on the server.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  )
}

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill in the values ` +
        `printed by \`supabase start\`.`,
    )
  }
  return value
}
