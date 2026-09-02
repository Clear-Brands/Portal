'use client'

import Link from 'next/link'

import { useActionState } from '@/lib/use-resilient-action'
import { Button, Field, Notice, inputClass } from '@/components/ui'
import { selfSignUp, type SignUpState } from './actions'

const initial: SignUpState = {}

export function SignupForm() {
  const [state, action, pending] = useActionState(selfSignUp, initial)

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, tiny local asset; the Netlify image loader adds nothing here. */}
          <img src="/logo-lockup.png" alt="Clear Brands" className="mx-auto h-8 w-auto" />
          <h1 className="mt-3 font-head text-[30px] leading-tight text-paper">Create your account</h1>
        </div>

        <div className="rounded-[14px] border border-line bg-gradient-to-b from-[#17171b] to-[#131316] p-[34px]">
          {state.ok ? (
            <Notice tone="success">
              Almost there — check your email for a verification link. Once you confirm it, sign in
              and you&rsquo;re on the portal.
            </Notice>
          ) : (
            <form action={action} className="grid gap-4">
              <p className="text-[13.5px] text-muted">
                Use your company email address — we match it to your partner program automatically.
                If your company isn&rsquo;t set up for self-serve signup yet, ask Clear Brands to add
                you instead.
              </p>

              <Field label="Full name">
                <input className={inputClass} name="name" autoComplete="name" required autoFocus maxLength={160} />
              </Field>

              <Field label="Work email">
                <input
                  className={inputClass}
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                />
              </Field>

              <Field label="Password" hint="At least 8 characters.">
                <input
                  className={inputClass}
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </Field>

              <Field label="Confirm password">
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

              <Button type="submit" disabled={pending}>
                {pending ? 'Creating account…' : 'Create account'}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-[12.5px] text-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-volt underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
