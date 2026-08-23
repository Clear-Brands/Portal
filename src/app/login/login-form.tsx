'use client'

import { useActionState, useState } from 'react'
import { useSearchParams } from 'next/navigation'

import { Button, Field, Notice, inputClass } from '@/components/ui'
import { sendSignInLink, signInWithPassword, type AuthState } from './actions'

const initial: AuthState = {}

export function LoginForm() {
  const params = useSearchParams()
  const next = params.get('next') ?? '/'
  const linkError = params.get('error')

  const [mode, setMode] = useState<'password' | 'link'>('password')
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signInWithPassword,
    initial,
  )
  const [linkState, linkAction, linkPending] = useActionState(sendSignInLink, initial)

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, tiny local asset; the Netlify image loader adds nothing here. */}
          <img src="/logo-lockup.png" alt="Clear Brands" className="mx-auto h-8 w-auto" />
          <h1 className="mt-3 font-head text-[30px] leading-tight text-paper">Partner Portal</h1>
        </div>

        <div className="rounded-[14px] border border-line bg-gradient-to-b from-[#17171b] to-[#131316] p-[34px]">
          {linkError === 'link-expired' ? (
            <div className="mb-5">
              <Notice tone="error">
                That sign-in link has already been used or has expired. Request a new one below.
              </Notice>
            </div>
          ) : null}

          {mode === 'password' ? (
            <form action={passwordAction} className="grid gap-4">
              <input type="hidden" name="next" value={next} />

              <Field label="Email">
                <input
                  className={inputClass}
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  autoFocus
                />
              </Field>

              <Field label="Password">
                <input
                  className={inputClass}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                />
              </Field>

              {passwordState.error ? <Notice tone="error">{passwordState.error}</Notice> : null}

              <Button type="submit" disabled={passwordPending}>
                {passwordPending ? 'Signing in…' : 'Sign in'}
              </Button>

              <button
                type="button"
                onClick={() => setMode('link')}
                className="text-[13px] text-muted underline underline-offset-4 hover:text-paper"
              >
                Email me a sign-in link instead
              </button>
            </form>
          ) : (
            <form action={linkAction} className="grid gap-4">
              {linkState.sent ? (
                <Notice tone="success">
                  If that address is on the portal, a sign-in link is on its way. It is good for one
                  use and expires in an hour.
                </Notice>
              ) : (
                <>
                  <p className="text-[13.5px] text-muted">
                    We&rsquo;ll email you a link that signs you in without a password.
                  </p>

                  <Field label="Email">
                    <input
                      className={inputClass}
                      type="email"
                      name="email"
                      autoComplete="username"
                      required
                      autoFocus
                    />
                  </Field>

                  {linkState.error ? <Notice tone="error">{linkState.error}</Notice> : null}

                  <Button type="submit" disabled={linkPending}>
                    {linkPending ? 'Sending…' : 'Send me a link'}
                  </Button>
                </>
              )}

              <button
                type="button"
                onClick={() => setMode('password')}
                className="text-[13px] text-muted underline underline-offset-4 hover:text-paper"
              >
                Use a password instead
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[12.5px] text-muted">
          Trouble signing in? Ask Clear Brands to check you&rsquo;re on the roster.
        </p>
      </div>
    </main>
  )
}
