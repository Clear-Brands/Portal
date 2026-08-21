import 'server-only'

/**
 * A best-effort, in-process rate limiter.
 *
 * Why in-process rather than a database RPC: `anon` holds no table or function
 * privileges at all (0011_grants.sql — "There is no public data"), and a login
 * attempt is by definition unauthenticated, so a check that ran as a database
 * call would either need its own carve-out in that explicit grant surface or
 * would have to run as the service-role client for a bare counter table —
 * both worse than the limitation this carries instead.
 *
 * The real limitation: this map lives in one server process. A cold start or
 * a scale-out to a second instance resets or splits the count. That is an
 * honest tradeoff for a low-volume B2B portal, not a hidden one — this is
 * abuse mitigation (slow down a script), not the security boundary. The
 * boundary is that a wrong password never distinguishes "no such account"
 * from "wrong password" (see the comment in src/app/login/actions.ts).
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Cheap, unbounded-growth guard: a map entry that's already expired is worth
// clearing out the next time anything touches the store, rather than trusting
// every caller to eventually retry the same key.
function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * A fixed-window counter. `key` should already identify what's being
 * throttled (e.g. `login:email:someone@example.com`) — this module has no
 * opinion on what a "request" is.
 */
export function checkRateLimit(key: string, max: number, windowSeconds: number): RateLimitResult {
  const now = Date.now()
  sweep(now)

  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (existing.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) }
  }

  existing.count += 1
  return { allowed: true, retryAfterSeconds: 0 }
}
