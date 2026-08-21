import { test, expect } from '@playwright/test'
import { ACCOUNTS, signIn } from './helpers'

/**
 * Journey: importing a CSV of new roster members — preview, then commit.
 *
 * previewRosterImport and commitRosterImport both re-parse the CSV
 * server-side (see import-wizard.tsx's comment on that), so this test types
 * the CSV directly into the "paste CSV text instead" textarea rather than
 * staging a real file upload — it exercises the same server actions either
 * way, without needing a file on disk in CI.
 */
test('partner admin imports a roster CSV via preview then commit', async ({ page }) => {
  await signIn(page, ACCOUNTS.partnerAdmin)

  await page.goto('/roster/import')
  await expect(page.getByRole('heading', { name: 'Import roster' })).toBeVisible()

  const uniqueEmail = `e2e.${Date.now()}@example.com`
  const csv = `name,email,pod,kind\nE2E Test Person,${uniqueEmail},,member`

  await page.getByText('Paste CSV text instead').click()
  await page.getByPlaceholder('name,email,pod,kind').fill(csv)
  await page.getByRole('button', { name: /preview import/i }).click()

  await expect(page.getByText('1 ready')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('cell', { name: uniqueEmail })).toBeVisible()

  await page.getByRole('button', { name: /^import 1 person$/i }).click()

  await expect(page.getByText(/import another file/i)).toBeVisible({ timeout: 10_000 })
})
