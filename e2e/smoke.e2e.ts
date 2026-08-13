import { expect, test } from '@playwright/test'
import path from 'node:path'

const testArchive = path.resolve(process.cwd(), 'e2e', 'fixtures', 'baustellenfotos-test.zip')

test('analysiert eine ZIP-Datei lokal und lädt einen CSV-Bericht herunter', async ({ page }) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    const target = new URL(request.url())
    if (target.protocol === 'blob:' || target.protocol === 'data:') return
    if (target.hostname !== '127.0.0.1' && target.hostname !== 'localhost') externalRequests.push(request.url())
  })
  await page.goto('./')
  await expect(page.getByText('Technisches Maximum: 10.000 Bilder')).toBeVisible()
  await expect(page.getByText(/Version 1\.2\.1/)).toBeVisible()

  await expect(
    page.getByText(/Alle Bilder sowie vorhandene EXIF-, Aufnahmezeit- und GPS-Daten werden ausschließlich lokal/i),
  ).toBeVisible()
  await expect(page.getByText(/keine Bilder oder Metadaten hochgeladen/i)).toBeVisible()

  const fileInput = page.locator('input[type="file"][accept*="zip"], input[type="file"]').first()
  await expect(fileInput).toBeAttached()
  await fileInput.setInputFiles(testArchive)
  await expect(page.getByText('baustellenfotos-test.zip', { exact: true })).toBeVisible()

  const startButton = page.getByRole('button', { name: /Analyse starten|Bilder analysieren/i })
  if (await startButton.isVisible()) await startButton.click()

  await expect(
    page.getByText(/Duplikate und Prüfvorschläge|Starker Treffer|Prüfvorschlag/i).first(),
  ).toBeVisible({ timeout: 60_000 })
  let visibleResultText = ''
  for (const sectionName of [/Starke Treffer/i, /Manuell prüfen/i, /Niedrige Priorität/i]) {
    const tab = page.getByRole('tab', { name: sectionName })
    if (await tab.isVisible()) {
      await tab.click()
      visibleResultText += `\n${await page.locator('.duplicate-group').allInnerTexts()}`
    }
  }
  for (const expectedVariant of [
    'kopie-anderer-name.png',
    'skaliert-180x120.png',
    'heller.png',
    'jpeg-artige-kompression.png',
    'leichter-zuschnitt.png',
    'leicht-gedreht.png',
  ]) {
    expect(visibleResultText).toContain(expectedVariant)
  }

  const csvButton = page.getByRole('button', { name: /CSV-Bericht|CSV (?:herunterladen|exportieren)|Als CSV exportieren/i })
  await expect(csvButton).toBeEnabled()

  const downloadPromise = page.waitForEvent('download')
  await csvButton.click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.csv$/i)
  expect(await download.failure()).toBeNull()
  expect(externalRequests, 'Die lokale Analyse darf keine externen Netzwerkanfragen auslösen.').toEqual([])
})
