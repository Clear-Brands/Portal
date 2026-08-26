'use client'

import { useActionState as useReactActionState } from 'react'

/**
 * A drop-in replacement for React's useActionState that retries a failed
 * server action before giving up, and — this is the part the single-retry
 * version didn't do — never lets a repeat failure escape to the page-level
 * error boundary.
 *
 * Every mutation failure captured in production so far — the flat-fee save
 * that inspired this, "First invoice paid" on a real deal, switching the
 * active partner — has the same signature: the deal/partner/rates row in
 * Supabase is completely untouched afterward (confirmed against
 * postgrest_logs and the row's own updated_at), meaning the request never
 * reached our server code at all. It's failing at Netlify's function-routing
 * layer, before Next.js ever runs, so there is nothing our own try/catch
 * inside a server action could ever catch — the exception surfaces on the
 * *client's* fetch that invokes the action, which is exactly what trips the
 * nearest error.tsx. Next.js's own background link-prefetches survive this
 * same failure invisibly because they retry on their own; a form submission
 * got no such retry before this hook existed, so a transient blip that a
 * page load shrugs off turned a mutation into a hard crash instead.
 *
 * A single retry cut how often that happened but didn't close it — a hiccup
 * lasting longer than the ~700ms gap between two attempts still took out
 * both, and the raw throw that escaped still swapped the whole page (or, for
 * a confirm dialog like "Mark this deal payable?", the dialog itself) for
 * the crash screen, taking whatever the person had just typed with it. Two
 * changes here: up to two retries with a longer, increasing pause between
 * attempts (network blips are rarely millisecond-scale, so giving the
 * connection more room to recover matters more than trying faster), and —
 * if every attempt still fails — resolving to an ordinary `{ error }` state
 * instead of re-throwing. Every action in this app already returns that
 * exact shape for a validation failure, so the same inline error text and
 * "try again" the form already shows for "that email's taken" now shows up
 * here too, with the form or dialog still open and their input intact,
 * rather than a full-page crash for what's genuinely just a network blip.
 *
 * A validation failure (bad input, no permission, a business rule) never
 * touches this retry/fallback path at all: those come back as a normal
 * `{ error: "..." }` state on the first try, not a thrown exception, so they
 * still show up immediately as-is.
 *
 * Tradeoff worth knowing: if a request's *response* were lost after the
 * database write had already gone through — as opposed to the request never
 * arriving at all, which is everything we've actually observed — a retry
 * would re-run the action a second time. transition_deal, record_payout and
 * friends are close to idempotent (an update keyed by the row's current
 * state), so the practical risk is a duplicate activity-log entry, not a
 * duplicate charge or a duplicate payout — those still require a separate,
 * deliberate approval step. Given every real failure so far shows zero
 * partial writes, a couple of retries is worth that small residual risk.
 */
const RETRY_DELAYS_MS = [600, 1500]

export function useActionState<State extends { error?: string }, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
  permalink?: string,
) {
  const resilientAction = async (state: Awaited<State>, payload: Payload) => {
    let lastError: unknown

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]))
      }
      try {
        return await action(state, payload)
      } catch (err) {
        lastError = err
      }
    }

    // Every attempt hit the same wall. Log it for the record, then degrade
    // into the same { error } shape a validation failure already returns —
    // never let this reach the caller as a throw.
    console.error('Action failed after retries:', lastError)
    return { error: "That didn't save — the connection hiccuped. Try again in a moment." } as State
  }

  return useReactActionState(resilientAction, initialState, permalink)
}
