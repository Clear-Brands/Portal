'use client'

import { useEffect } from 'react'

/**
 * Fallback for anything that crashes outside the portal shell — login,
 * /access-paused, /not-on-roster — none of which get the portal's own
 * error.tsx since they render outside that route group. Kept deliberately
 * plain (no Card/Notice from the portal's component set) since a login-page
 * crash shouldn't assume any app chrome loaded successfully.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-head text-[13px] tracking-[0.1em] text-muted uppercase">
        Clear Brands
      </p>
      <h1 className="font-head text-[18px] tracking-[0.02em] text-paper">
        That didn&apos;t load right.
      </h1>
      <p className="text-[14px] text-muted">
        Almost always a brief hiccup — try again in a moment.
        {error.digest ? <span className="block">Reference: {error.digest}</span> : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-[8px] bg-volt px-4 py-2.5 font-head text-[14px] font-bold text-ink hover:brightness-110"
      >
        Try again
      </button>
    </div>
  )
}
