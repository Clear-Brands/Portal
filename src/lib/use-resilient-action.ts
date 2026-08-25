'use client'

import { useActionState as useReactActionState } from 'react'

/**
 * A drop-in replacement for React's useActionState that retries a failed
 * server action once before giving up.
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
 * gets no such retry today, so a transient blip that a page load shrugs off
 * turns a mutation into a hard crash instead.
 *
 * This wraps the action reference passed to useActionState so a thrown
 * network-level failure gets one silent retry (after a short pause) before
 * it's allowed to reach the error boundary — closing that same gap for
 * mutations that Next already closes for page loads. A validation failure
 * (bad input, no permission, a business rule) never triggers this: those
 * come back as a normal `{ error: "..." }` state, not a thrown exception, so
 * they still show up immediately as-is and are never retried.
 *
 * Tradeoff worth knowing: if a request's *response* were lost after the
 * database write had already gone through — as opposed to the request never
 * arriving at all, which is everything we've actually observed — a retry
 * would re-run the action a second time. transition_deal, record_payout and
 * friends are close to idempotent (an update keyed by the row's current
 * state), so the practical risk is a duplicate activity-log entry, not a
 * duplicate charge or a duplicate payout — those still require a separate,
 * deliberate approval step. Given every real failure so far shows zero
 * partial writes, one retry is worth that small residual risk.
 */
export function useActionState<State, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
  permalink?: string,
) {
  const resilientAction = async (state: Awaited<State>, payload: Payload) => {
    try {
      return await action(state, payload)
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 700))
      return await action(state, payload)
    }
  }

  return useReactActionState(resilientAction, initialState, permalink)
}
