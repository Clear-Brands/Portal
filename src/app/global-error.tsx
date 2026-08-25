'use client'

import { useEffect } from 'react'

/**
 * Absolute last resort: only fires if the root layout itself throws, which
 * replaces RootLayout entirely — Next.js requires this file to render its
 * own <html>/<body>. Inline styles, not Tailwind: if the layout crashed
 * before mounting, there's no guarantee globals.css made it onto the page.
 */
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: '0 24px',
          textAlign: 'center',
          background: '#0d0d0f',
          color: '#f4f4f5',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <p style={{ fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.65 }}>
          Clear Brands
        </p>
        <h1 style={{ fontSize: 18, margin: 0 }}>That didn&apos;t load right.</h1>
        <p style={{ fontSize: 14, opacity: 0.75, margin: 0 }}>
          Almost always a brief hiccup — try again in a moment.
          {error.digest ? <span style={{ display: 'block' }}>Reference: {error.digest}</span> : null}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            borderRadius: 8,
            background: '#c8f52f',
            color: '#0d0d0f',
            fontWeight: 700,
            padding: '10px 16px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
