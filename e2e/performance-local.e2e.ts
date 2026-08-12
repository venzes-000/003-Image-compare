import { expect, test } from '@playwright/test'

const performanceArchive = process.env.PERF_TEST_ZIP
const configuredBudget = Number(process.env.PERF_BUDGET_MS)
const performanceBudgetMs = Number.isFinite(configuredBudget) && configuredBudget > 0
  ? configuredBudget
  : 30_000

test('misst einen privaten lokalen Referenzlauf', async ({ page }) => {
  test.skip(!performanceArchive, 'PERF_TEST_ZIP verweist optional auf ein lokales Referenzarchiv.')
  test.setTimeout(performanceBudgetMs + 90_000)

  await page.goto('./')
  await page.locator('input[type="file"]').first().setInputFiles(performanceArchive!)

  const startedAt = performance.now()
  await page.getByRole('button', { name: /Analyse starten|Bilder analysieren/i }).click()
  await expect(page.getByText(/Analyse abgeschlossen/i)).toBeVisible({
    timeout: performanceBudgetMs + 60_000,
  })
  const durationMs = performance.now() - startedAt

  console.info(`PERF_RESULT duration_ms=${Math.round(durationMs)} archive=${performanceArchive}`)
  expect(
    durationMs,
    `Der Referenzlauf überschreitet das Budget von ${performanceBudgetMs.toLocaleString('de-DE')} ms.`,
  ).toBeLessThanOrEqual(performanceBudgetMs)
})
