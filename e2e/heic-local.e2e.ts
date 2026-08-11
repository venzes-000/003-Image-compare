import { expect, test } from '@playwright/test'

const heicArchive = process.env.HEIC_TEST_ZIP

test('dekodiert HEIC lokal und erkennt eine identische Kopie', async ({ page }) => {
  test.skip(!heicArchive, 'HEIC_TEST_ZIP verweist optional auf ein lokales Testarchiv.')

  const externalRequests: string[] = []
  page.on('request', (request) => {
    const target = new URL(request.url())
    if (target.protocol === 'blob:' || target.protocol === 'data:') return
    if (target.hostname !== '127.0.0.1' && target.hostname !== 'localhost') externalRequests.push(request.url())
  })

  await page.goto('./')
  await page.locator('input[type="file"]').first().setInputFiles(heicArchive!)
  await page.getByRole('button', { name: /Analyse starten|Bilder analysieren/i }).click()

  await expect(page.getByText('aufnahme-original.heic', { exact: true }).first()).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText('aufnahme-kopie.heic', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Ergebnisgruppe/i).first()).toBeVisible()

  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: /Original anzeigen/i }).first().click()
  const preview = await popupPromise
  await preview.waitForURL(/^blob:/, { timeout: 90_000 })

  expect(externalRequests, 'Auch der HEIC-Decoder darf keine externen Anfragen auslösen.').toEqual([])
})
