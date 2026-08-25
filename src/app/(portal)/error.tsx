'use client'

import { useEffect } from 'react'

import { Button, Card, Eyebrow, Notice } from '@/components/ui'

/**
 * Catches a render failure anywhere under the portal shell — most commonly
 * today, an intermittent 503 from Netlify's Next.js Runtime that never even
 * reaches Supabase (see the postgrest/postgres logs: nothing lands there
 * when this fires). Next.js's own React error #441 hides the real exception
 * in production, so there's nothing more specific to show the user; what
 * matters is that they get an actionable screen instead of a dead crash
 * page. `reset()` re-renders this route segment in place — since the
 * underlying failures have consistently been transient (the same request
 * succeeding seconds later on retry), a second attempt is the right first
 * move, not a reload of the whole app.
 */
export default function PortalError({
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
    <div className="mx-auto max-w-[520px] py-16 text-center">
      <Eyebrow>Something glitched</Eyebrow>
      <h1 className="mb-3 font-head text-[20px] tracking-[0.02em] text-paper">
        That didn&apos;t load right.
      </h1>
      <Card className="text-left">
        <Notice tone="error">
          This page failed to load. It&apos;s almost always a brief hiccup — try again and it
          usually comes right back.
          {error.digest ? (
            <span className="mt-1.5 block text-muted">Reference: {error.digest}</span>
          ) : null}
        </Notice>
        <div className="mt-4 flex items-center gap-3">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
          <a href="/" className="text-[13.5px] text-muted hover:text-paper">
            Or go back to the dashboard
          </a>
        </div>
      </Card>
    </div>
  )
}
