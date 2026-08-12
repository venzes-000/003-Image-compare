import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const realArchive = process.env.REAL_TEST_ZIP

interface ExportedImage {
  id: string
  name: string
}

interface ExportedEdge {
  sourceId: string
  targetId: string
  strong: boolean
  category: string
}

interface ExportedGroup {
  memberIds: string[]
  uncertainIds: string[]
  edgeIds: string[]
}

interface ExportedReport {
  images: ExportedImage[]
  edges: ExportedEdge[]
  groups: ExportedGroup[]
}

const confirmedPairs = [
  ['08072024_094920088_17309_Zerrenthin_Germany_Penkun.jpg', 'BB 11-1 B 104 KW 36 (5).jpg'],
  ['08072024_105335849_17322_Grambow_Germany_Penkun.jpg', '20220830_040723810_UER20_17322_Grambow_Germany_Penkun.jpg'],
  ['08072024_031233421_17322_Rossow_Germany_Penkun.jpg', '20210706_132356_Günay-Dienstleistungen.JPG'],
  ['20220711_123957___[map].jpg', '20220912_051707365_Dorfstraße_40_17322_Grambow_Germany_Penkun.jpg'],
  ['08072024_094133663_17309_Polzow_Germany_Penkun.jpg', 'BB 11-1 Chausseestraße KW 26 (2).jpg'],
  ['08072024_094402166_17309_Zerrenthin_Germany_Penkun.jpg', 'BB 11-1 B 104 KW 27 (10).jpg'],
  ['20220809_114855_Günay-Dienstleistungen.jpg', 'JLQQ9206.jpg'],
  // These two almost identical pairs were previously lost because only one
  // image carried EXIF Orientation=6.
  ['20221107_055929683_Ausbau_17322_Grambow_Germany_Penkun.jpg', 'OJBZ4572.jpg'],
  ['TimePhoto_20220427_114804.jpg', '08072024_122710720_17321_Ramin_Germany_Penkun.jpg'],
] as const

test('findet alle bestätigten Paare der privaten 100er-Regression', async ({ page }) => {
  test.skip(!realArchive, 'REAL_TEST_ZIP verweist optional auf die lokale private 100er-ZIP.')
  test.setTimeout(180_000)

  await page.goto('./')
  await page.locator('input[type="file"]').first().setInputFiles(realArchive!)
  await page.getByRole('button', { name: /Analyse starten|Bilder analysieren/i }).click()
  await expect(page.getByText(/Analyse abgeschlossen/i)).toBeVisible({ timeout: 150_000 })

  const jsonButton = page.getByRole('button', { name: /JSON/i })
  const downloadPromise = page.waitForEvent('download')
  await jsonButton.click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const report = JSON.parse(await readFile(downloadPath!, 'utf8')) as ExportedReport

  const idsByName = new Map(report.images.map((image) => [image.name.normalize('NFC'), image.id]))
  const pairKey = (left: string, right: string) => [left, right].sort().join('\u0000')
  const edgesByPair = new Map(
    report.edges.map((edge) => [pairKey(edge.sourceId, edge.targetId), edge]),
  )

  for (const [leftName, rightName] of confirmedPairs) {
    const leftId = idsByName.get(leftName.normalize('NFC'))
    const rightId = idsByName.get(rightName.normalize('NFC'))
    expect(leftId, `Bild fehlt: ${leftName}`).toBeTruthy()
    expect(rightId, `Bild fehlt: ${rightName}`).toBeTruthy()
    const edge = edgesByPair.get(pairKey(leftId!, rightId!))
    expect(edge, `Bestätigtes Paar wurde nicht verglichen: ${leftName} / ${rightName}`).toBeDefined()
    expect(edge?.strong, `Bestätigtes Paar ist nicht stark: ${leftName} / ${rightName}`).toBe(true)
  }

  const weakFalseLeft = idsByName.get('2 Penkun, Stettiner Chaussee (41).JPG')
  const weakFalseRight = idsByName.get('20211221_013326(nachm.)___[map].jpg')
  const weakFalseEdge = edgesByPair.get(pairKey(weakFalseLeft!, weakFalseRight!))
  expect(weakFalseEdge?.strong ?? false, 'Der bekannte schwache Fehlalarm darf nie stark sein.').toBe(false)

  const primaryOwner = new Map<string, string>()
  for (const [groupIndex, group] of report.groups.entries()) {
    const groupId = `group-${groupIndex + 1}`
    const strongMemberIds = group.memberIds.filter((imageId) => imageId !== undefined)
    if (strongMemberIds.length >= 2) {
      for (const imageId of strongMemberIds) {
        expect(primaryOwner.has(imageId), `Bild ${imageId} ist Mitglied mehrerer starker Gruppen.`).toBe(false)
        primaryOwner.set(imageId, groupId)
      }
    }
  }
  const presentedEdgeIds = report.groups.flatMap((group) => group.edgeIds ?? [])
  expect(new Set(presentedEdgeIds).size, 'Jede konkrete Vergleichskante darf nur einmal präsentiert werden.')
    .toBe(presentedEdgeIds.length)
})
