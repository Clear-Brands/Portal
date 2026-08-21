import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Demo accounts created by `npm run seed:auth` (scripts/seed-auth.mjs), all on
 * the fixed local-dev password that script sets. Overridable via env vars so
 * these tests can point at a differently-seeded stack without editing code.
 */
export const DEMO_PASSWORD = process.env.E2E_PASSWORD ?? 'clearbrands-dev'

export const ACCOUNTS = {
  /** Internal admin — full access, including recording payouts. */
  internalAdmin: process.env.E2E_INTERNAL_ADMIN_EMAIL ?? 'cristian@clearbrands.io',
  /** Partner admin for FieldPulse — can import roster CSVs. */
  partnerAdmin: process.env.E2E_PARTNER_ADMIN_EMAIL ?? 'partners@fieldpulse.com',
  /** A member (rep) on FieldPulse's roster — submits their own deals. */
  member: process.env.E2E_MEMBER_EMAIL ?? 'jake@fieldpulse.com',
}

/**
 * Signs in through the real login form (password mode) and waits for the
 * post-login redirect. There is no shortcut here — see the note in
 * playwright.config.ts on why that's the honest choice for this app.
 */
export async function signIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
}
