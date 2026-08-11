import { expect, test } from '@playwright/test'

const formatsArchive = process.env.FORMATS_TEST_ZIP

test('dekodiert AVIF, GIF, BMP und TIFF lokal', async ({ page }) => {
  test.skip(!formatsArchive, 'FORMATS_TEST_ZIP verweist optional auf ein lokales Testarchiv.')

  await page.goto('./')
  await page.locator('input[type="file"]').first().setInputFiles(formatsArchive!)
  await page.getByRole('button', { name: /Analyse starten|Bilder analysieren/i }).click()

  await expect(page.getByText(/Ergebnisgruppe/i).first()).toBeVisible({ timeout: 90_000 })
  for (const extension of ['avif', 'gif', 'bmp', 'tiff']) {
    await expect(page.getByText(`motiv.${extension}`, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(`motiv-kopie.${extension}`, { exact: true }).first()).toBeVisible()
  }
})
