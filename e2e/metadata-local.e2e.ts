import { expect, test } from '@playwright/test'

const metadataArchive = process.env.EXIF_TEST_ZIP

test('liest GPS, Aufnahmezeit und Kamera lokal als getrennten Kontext', async ({ page }) => {
  test.skip(!metadataArchive, 'EXIF_TEST_ZIP verweist optional auf ein lokales Testarchiv.')

  await page.goto('./')
  await page.locator('input[type="file"]').first().setInputFiles(metadataArchive!)
  await page.getByRole('button', { name: /Analyse starten|Bilder analysieren/i }).click()

  await expect(page.getByText(/Ergebnisgruppe/i).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/GPS 0 m/i).first()).toBeVisible()
  await expect(page.getByText(/Zeit unter 1 Sek\./i).first()).toBeVisible()
  await expect(page.getByText(/Kamera gleich/i).first()).toBeVisible()
  await expect(page.getByText(/EXIF-Kontext: stützend/i).first()).toBeVisible()
})
