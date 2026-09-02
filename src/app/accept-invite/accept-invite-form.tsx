'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Field, Notice, inputClass } from '@/components/ui'
import { setInitialPassword, type AcceptInviteState } from './actions'

const initial: AcceptInviteState = {}

type Status = 'checking' | 'ready' | 'link-error'

/**
 * Where an invite (or "Add a reset password email" — see admin-logins.tsx)
 * link lands. Supabase hands these back with the session in the URL
 * fragment (#access_token=...&refresh_token=...), not a `?code=` query
 * param — see the comment on /auth/set-session for why. A fragment never
 * reaches the server, so this has to be a client component: on mount it
 * reads the fragment itself, relays the two tokens to /auth/set-session to
 * get a real cookie session, then shows the "create a password" form.
 *
 * If there's no fragment at all (a refresh after the tokens were already
 * relayed and stripped from the URL, for instance), this skips straight to
 * the form rather than erroring — the session cookie set on the first pass
 * is still good, and if it isn't, setInitialPassword's own getUser() check
 * catches that and reports it there instead.
 */
export function AcceptInviteForm() {
  const [status, setStatus] = useState<Status>('checking')
  const [state, action, pending] = useActionState(setInitialPassword, initial)
  // Supabase puts `type` (invite | recovery) in the same hash as the tokens.
  // Carried through as a hidden field so the server action can send a
  // brand-new partner admin somewhere more useful than a returning user
  // resetting their password — see the comment on setInitialPassword.
  const [flow, setFlow] = useState<string>('')

  useEffect(() => {
    // The `await` before every setStatus below is deliberate, not just a
    // consequence of the fetch: setting state synchronously and unconditionally
    // on mount (nothing here depends on a prop or on prior state) belongs in
    // the render itself, not an effect — react-hooks flags exactly that. Sending
    // this branch through a microtask first, same as the two branches that
    // already have to wait on the network, keeps all three paths consistent
    // rather than special-casing the no-token one.
    let cancelled = false

    async function establishSession() {
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
      const params = new URLSearchParams(hash)
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      const type = params.get('type')
      if (type && !cancelled) setFlow(type)

      if (!access_token || !refresh_token) {
        await Promise.resolve()
        if (!cancelled) setStatus('ready')
        return
      }

      try {
        const res = await fetch('/auth/set-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token, refresh_token }),
        })
        // Strip the tokens out of the URL either way — they're single-use
        // and shouldn't linger in browser history or get shared in a
        // screenshot of the address bar.
        window.history.replaceState(null, '', window.location.pathname)
        if (!cancelled) setStatus(res.ok ? 'ready' : 'link-error')
      } catch {
        window.history.replaceState(null, '', window.location.pathname)
        if (!cancelled) setStatus('link-error')
      }
    }

    void establishSession()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, tiny local asset; the Netlify image loader adds nothing here. */}
          <img src="/logo-lockup.png" alt="Clear Brands" className="mx-auto h-8 w-auto" />
          <h1 className="mt-3 font-head text-[30px] leading-tight text-paper">
            {status === 'link-error' ? 'Link expired' : 'Set your password'}
          </h1>
        </div>

        <div className="rounded-[14px] border border-line bg-gradient-to-b from-[#17171b] to-[#131316] p-[34px]">
          {status === 'checking' ? (
            <p className="text-[13.5px] text-muted">Confirming your invite&hellip;</p>
          ) : status === 'link-error' ? (
            <Notice tone="error">
              That link has expired or was already used. Ask Clear Brands to send a new invite.
            </Notice>
          ) : (
            <form action={action} className="grid gap-4">
              <input type="hidden" name="flow" value={flow} />

              <p className="text-[13.5px] text-muted">
                Choose a password. You&rsquo;ll use it to sign back in next time.
              </p>

              <Field label="New password">
                <input
                  className={inputClass}
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  autoFocus
                />
              </Field>

              <Field label="Confirm new password">
                <input
                  className={inputClass}
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </Field>

              {state.error ? <Notice tone="error">{state.error}</Notice> : null}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={pending}>
                  {pending ? 'Saving…' : 'Change password'}
                </Button>
                <Link
                  href="/login"
                  className="text-[13.5px] text-muted underline decoration-line hover:text-paper"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
