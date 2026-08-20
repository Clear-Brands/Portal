import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * The service-role client. Bypasses row-level security entirely.
 *
 * Reach for this in exactly three situations and no others:
 *
 *   1. Creating or inviting auth accounts (the admin API).
 *   2. The outbox worker delivering queued events.
 *   3. Processing an inbound webhook, which has no user session.
 *
 * Anything acting on behalf of a signed-in person uses `createClient()` from
 * ./server instead, so their permissions actually apply. If you find yourself
 * reaching for this to "just make the query work", the answer is a policy fix.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — this is a server-only secret.')
  }

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
