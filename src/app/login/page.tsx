import { Suspense } from 'react'

import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in' }

/**
 * The form reads the query string (`?next=` and `?error=`), which means it must
 * sit behind a Suspense boundary — otherwise Next cannot prerender this route at
 * all and every visit pays for a server render.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginSkeleton() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="w-full max-w-[420px]">
        <div className="mb-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, tiny local asset; the Netlify image loader adds nothing here. */}
          <img src="/logo-lockup.png" alt="Clear Brands" className="mx-auto h-8 w-auto" />
          <h1 className="mt-3 font-head text-[30px] leading-tight text-paper">Partner Portal</h1>
        </div>
        <div
          className="h-[292px] rounded-[14px] border border-line bg-gradient-to-b from-[#17171b] to-[#131316]"
          aria-hidden
        />
      </div>
    </main>
  )
}
