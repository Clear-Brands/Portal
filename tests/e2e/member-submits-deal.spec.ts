import { test, expect } from '@playwright/test'
import { ACCOUNTS, signIn } from './helpers'

/**
 * Journey: a member sends in a referral and sees it land on their own list.
 *
 * Exercises the RLS boundary as much as the UI — `listDeals` for a member is
 * filtered by policy, not by a query param the browser could edit, so this
 * also proves a member's own submission is visible to them under that policy.
 */
test('member submits a deal and sees it in My deals', async ({ page }) => {
  await signIn(page, ACCOUNTS.member)

  await page.goto('/my-deals')
  await expect(page.getByRole('heading', { name: 'My deals' })).toBeVisible()

  const clientName = `Playwright E2E Client ${Date.now()}`

  await page.getByLabel('Client').fill(clientName)
  await page.getByLabel('Service').fill('SEO')
  await page.getByLabel('City').fill('Austin')
  await page.getByLabel('State').fill('TX')
  await page.getByRole('button', { name: /send it in/i }).click()

  // The form clears and re-renders with a success notice on commit.
  await expect(page.getByText(/added|sent|submitted/i).first()).toBeVisible({ timeout: 10_000 })

  // The new referral shows up in "Your referrals" below — scoped to table
  // cells so this doesn't also match the (hidden, off-screen-width) mobile
  // card layout rendered for the same data.
  await expect(page.getByRole('cell', { name: clientName })).toBeVisible()
})
