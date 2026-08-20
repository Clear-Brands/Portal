import type { Metadata, Viewport } from 'next'

// Archivo and Archivo Black, self-hosted from npm.
//
// The original pulled Archivo from fonts.googleapis.com, the Excel library from
// cdnjs and the Supabase client from esm.sh at runtime — three third-party hosts
// on the critical path, none pinned, none with an integrity hash. If esm.sh was
// unreachable the app showed "couldn't reach its database"; if cdnjs was, exports
// silently degraded to CSV.
//
// @fontsource ships the same faces as a versioned npm package, so the font is
// pinned in the lockfile, the build needs no network access, and no request ever
// leaves for a font host. next/font/google would also self-host the result, but
// it fetches at build time, which breaks air-gapped and offline builds.
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/700.css'
import '@fontsource/archivo-black/400.css'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Clear Brands Partner Portal',
    template: '%s · Clear Brands',
  },
  description: 'Referrals, spiffs and payouts for Clear Brands partner programs.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#0d0d0f',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
