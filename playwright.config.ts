import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end config.
 *
 * These tests exercise real sign-in against a live Supabase project — there is
 * no mocked auth layer in this app by design (see src/lib/supabase/server.ts).
 * That means running them for real requires:
 *
 *   1. A running Supabase stack (`npm run db:start && npm run db:reset`)
 *   2. `.env.local` filled in from `.env.example` with that stack's values
 *   3. Seeded demo logins (`npm run seed:auth`)
 *
 * Without all three, `npm run dev` itself throws on the first Supabase call
 * (see requiredEnv() in src/lib/supabase/server.ts) rather than the tests
 * failing on a bad selector — that is a real environment problem, not a test
 * bug, and is reported as such.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
