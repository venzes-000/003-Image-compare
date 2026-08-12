import { describe, expect, it } from 'vitest'
import type { AnalysisResult, ImageFeatureRecord } from '../types'
import { createCleanedFileRows } from './cleaned-list'
import { createCsvReport, escapeCsvCell, formatCsv } from './csv'
import { createJsonReportData } from './json'

function image(
  id: string,
  path: string,
  decision: ImageFeatureRecord['decision'],
  metadata?: ImageFeatureRecord['metadata'],
): ImageFeatureRecord {
  return {
    id,
    path,
    name: path.slice(path.lastIndexOf('/') + 1),
    size: 100,
    compressedSize: 80,
    mime: 'image/jpeg',
    format: 'jpeg',
    width: 10,
    height: 10,
    aspectRatio: 1,
    aHash: '00',
    dHash: '00',
    pHash: '00',
    histogram: [1],
    luminanceMean: 128,
    ...(metadata ? { metadata } : {}),
    gray: Uint8Array.from([128]),
    thumbnailKey: id,
    decision,
  }
}

function resultFixture(): AnalysisResult {
  return {
    version: '1.2.3',
    zipFingerprint: 'abc',
    zipName: 'bilder.zip',
    zipSize: 1234,
    analyzedAt: '2026-08-06T10:00:00.000Z',
    settings: {
      mode: 'balanced',
      workerCount: 2,
      pHashThreshold: 14,
      dHashThreshold: 14,
      aHashThreshold: 14,
      minimumSsim: 0.82,
      minimumHistogramSimilarity: 0.65,
      candidateLimitPerImage: 20,
    },
    summary: {
      totalEntries: 4,
      supportedImages: 4,
      skippedEntries: 0,
      corruptedImages: 0,
      totalUncompressedBytes: 400,
      formats: ['jpeg'],
      warnings: [],
    },
    images: [
      image('ref', 'Ordner/Referenz.jpg', 'unreviewed', {
        latitude: 52.52,
        longitude: 13.405,
        capturedAt: '2026-08-06T09:59:58.000Z',
        captureTimeHasTimezone: true,
        cameraMake: 'Acme',
        cameraModel: 'BauCam 1',
        lensModel: 'Weitwinkel',
        archiveModifiedAt: '2026-08-06T10:01:00.000Z',
        warnings: [],
      }),
      image('dup', '=HYPERLINK("bad")', 'duplicate', {
        latitude: 52.5201,
        longitude: 13.4051,
        capturedAt: '2026-08-06T10:00:00.000Z',
        captureTimeHasTimezone: true,
        cameraMake: 'Acme',
        cameraModel: 'BauCam 1',
        lensModel: 'Weitwinkel',
        archiveModifiedAt: '2026-08-06T10:02:00.000Z',
        warnings: [],
      }),
      image('later', 'Ordner/Später.jpg', 'later'),
      image('single', 'Andere/Einzel.jpg', 'unreviewed'),
    ],
    edges: [
      {
        id: 'edge-1',
        sourceId: 'ref',
        targetId: 'dup',
        strong: true,
        score: 96,
        confidence: 'very-high',
        category: 'almost-certain-duplicate',
        reasons: ['sehr ähnlich'],
        metrics: { pHashDistance: 1, dHashDistance: 2, ssim: 0.98, histogramSimilarity: 0.9 },
        metadata: {
          status: 'corroborates',
          contextScore: 98,
          gpsDistanceMeters: 13.1,
          captureTimeDifferenceSeconds: 2,
          sameCameraModel: true,
          reasons: ['GPS und Aufnahmezeit stimmen überein.'],
        },
      },
      {
        id: 'edge-2',
        sourceId: 'dup',
        targetId: 'later',
        strong: false,
        score: 68,
        confidence: 'medium',
        category: 'needs-review',
        reasons: ['schwacher Hinweis'],
        metrics: { pHashDistance: 12, dHashDistance: 13, ssim: 0.7, histogramSimilarity: 0.66 },
        metadata: {
          status: 'conflicts',
          gpsDistanceMeters: 17_200,
          reasons: ['GPS widerspricht.'],
        },
      },
    ],
    groups: [{
      id: 'gruppe-1',
      referenceId: 'ref',
      memberIds: ['ref', 'dup'],
      uncertainIds: ['later'],
      edgeIds: ['edge-1', 'edge-2'],
      status: 'unreviewed',
    }],
    comparisonDecisions: {
      'edge-1': 'duplicate',
      'edge-2': 'later',
    },
    errors: [],
  }
}

describe('CSV-Export', () => {
  it('schreibt BOM, CRLF und korrekte CSV-Escapes', () => {
    expect(formatCsv([['a;b', 'sagt "ja"', 'Zeile\n2']])).toBe('\ufeff"a;b";"sagt ""ja""";"Zeile\n2"\r\n')
    expect(createCsvReport(resultFixture()).startsWith('\ufeff')).toBe(true)
  })

  it('exportiert Metadatenkontext, aber standardmäßig keine exakten GPS-Koordinaten', () => {
    const csv = createCsvReport(resultFixture())
    expect(csv).toContain('GPS-Abstand (m)')
    expect(csv).toContain('Vergleichsbasis-GPS vorhanden')
    expect(csv).toContain('Stützt den visuellen Treffer')
    expect(csv).not.toContain('Vergleichsbasis-Breitengrad')
    expect(csv).not.toContain('52.52')
    expect(csv).not.toContain('13.405')
  })

  it('nimmt exakte GPS-Koordinaten nur nach ausdrücklicher Option in den CSV-Bericht auf', () => {
    const csv = createCsvReport(resultFixture(), { includeExactGps: true })
    expect(csv).toContain('Vergleichsbasis-Breitengrad')
    expect(csv).toContain('52.52')
    expect(csv).toContain('13.405')
  })

  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)', '  =HYPERLINK("x")', '\t=cmd']) (
    'neutralisiert mögliche Tabellenformel %j',
    (value) => expect(escapeCsvCell(value)).toContain("'"),
  )

  it('lässt echte Zahlen als Zahlenzellen stehen', () => {
    expect(escapeCsvCell(-2)).toBe('-2')
  })
})

describe('JSON- und bereinigter Listenexport', () => {
  it('exportiert Metadaten und Metriken, aber keine Analysepixel', () => {
    const report = createJsonReportData(resultFixture(), '2026-08-06T12:00:00.000Z')
    expect(report.exportVersion).toBe(4)
    expect(report.metadataNotice).toMatch(/genaue GPS-Koordinaten/)
    expect(report.edges[0]?.metrics.ssim).toBe(0.98)
    expect(report.edges[0]?.metadata?.gpsDistanceMeters).toBe(13.1)
    expect(report.images[0]?.metadata?.latitude).toBe(52.52)
    expect(report.images[0]).not.toHaveProperty('gray')
    expect(report.comparisons.find((comparison) => comparison.candidateId === 'later')).toMatchObject({
      comparisonBaseId: 'dup',
      edgeId: 'edge-2',
      directToReference: false,
      effectiveCandidateRotationDegrees: 0,
      presentationTier: 'low-priority',
      decision: 'later',
    })
  })

  it('leitet den Prüfstatus pro Kandidat ab und nicht aus einem gemeinsamen Gruppenstatus', () => {
    const fixture = resultFixture()
    fixture.groups[0]!.status = 'reviewed'
    const csv = createCsvReport(fixture)
    expect(csv).toContain(';Geprüft;Starker Treffer;')
    expect(csv).toContain(';Ungeprüft;Niedrige Priorität;')
  })

  it('exports the same concrete indirect comparison edge used by the UI resolver', () => {
    const csv = createCsvReport(resultFixture())
    expect(csv).toContain('Indirekt über Gruppenmitglied')
    expect(csv).toContain('edge-2')
    expect(csv).toContain('Niedrige Priorität')
  })

  it('exports the effective inverse candidate rotation for a reversed edge', () => {
    const fixture = resultFixture()
    const reversedEdge = fixture.edges.find((edge) => edge.id === 'edge-2')
    expect(reversedEdge).toBeDefined()
    if (!reversedEdge) return
    reversedEdge.sourceId = 'later'
    reversedEdge.targetId = 'dup'
    reversedEdge.metrics.alignmentRotationDegrees = 90

    const report = createJsonReportData(fixture, '2026-08-06T12:00:00.000Z')
    expect(report.comparisons.find((comparison) => comparison.candidateId === 'later'))
      .toMatchObject({ edgeId: 'edge-2', effectiveCandidateRotationDegrees: 270 })
    expect(createCsvReport(fixture)).toContain(';270;Manuell prüfen;')
  })

  it('trennt behaltene, bestätigte und ungeklärte Dateien nachvollziehbar', () => {
    const rows = createCleanedFileRows(resultFixture())
    expect(rows.find((row) => row.name === 'Referenz.jpg')?.category).toBe('behalten')
    expect(rows.find((row) => row.decision === 'duplicate')?.category).toBe('bestätigtes-duplikat')
    expect(rows.find((row) => row.decision === 'later')?.category).toBe('ungeklärt')
    expect(rows.find((row) => row.name === 'Einzel.jpg')?.category).toBe('behalten')
  })

  it('aggregiert isolierte Paarentscheidungen nachvollziehbar in die Dateiliste', () => {
    const fixture = resultFixture()
    fixture.images.find((image) => image.id === 'later')!.decision = 'unreviewed'
    fixture.comparisonDecisions = { 'edge-2': 'duplicate' }
    expect(createCleanedFileRows(fixture).find((row) => row.name === 'Später.jpg')).toMatchObject({
      category: 'bestätigtes-duplikat',
      decision: 'duplicate',
    })

    fixture.comparisonDecisions = { 'edge-2': 'different' }
    expect(createCleanedFileRows(fixture).find((row) => row.name === 'Später.jpg')).toMatchObject({
      category: 'behalten',
      decision: 'different',
    })
  })
})
