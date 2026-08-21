import { test, expect } from '@playwright/test'
import { ACCOUNTS, signIn } from './helpers'

/**
 * Journey: an internal admin reviews the payable batch and records the
 * transfer, then sees it land in the payout history below.
 *
 * `payouts.write` is internal-only in CAPABILITIES_APPLICABLE_TO, so this
 * signs in as the internal admin account, not a partner login.
 *
 * The batch button only renders when something is actually payable and this
 * month's transfer isn't already recorded (see RecordPayoutButton in
 * payout-controls.tsx) — both of which depend on seed data state, not on this
 * test. Rather than fail on an environment precondition it doesn't control,
 * the test skips with a clear reason when neither applies.
 */
test('admin records a payout for the payable batch', async ({ page }) => {
  await signIn(page, ACCOUNTS.internalAdmin)

  await page.goto('/payouts')
  await expect(page.getByRole('heading', { name: 'Payouts' })).toBeVisible()

  const recordButton = page.getByRole('button', { name: /review and record/i })
  const alreadyRecorded = page.getByText(/already recorded/i)
  const nothingPayable = page.getByText(/nothing is payable/i)

  if (await alreadyRecorded.isVisible().catch(() => false)) {
    test.skip(true, "This month's transfer is already recorded in the seed data — nothing to record.")
  }
  if (await nothingPayable.isVisible().catch(() => false)) {
    test.skip(true, 'Nothing is payable in the seed data right now.')
  }

  await recordButton.click()

  const reference = `E2E-${Date.now()}`
  await page.getByLabel('ACH reference').fill(reference)
  await page.getByRole('button', { name: /^record it$/i }).click()

  // The dialog closes on success and the batch card updates to say it's
  // already recorded — the state actually written, not merely a toast.
  await expect(page.getByText(/already recorded/i)).toBeVisible({ timeout: 10_000 })

  // And the new transfer appears in history with the reference just typed —
  // this comes from the database record, never from the form's own state.
  await expect(page.getByText(reference)).toBeVisible()
})
