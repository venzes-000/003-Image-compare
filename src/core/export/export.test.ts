import { describe, expect, it } from 'vitest'
import type { AnalysisResult, ImageFeatureRecord } from '../types'
import { createCleanedFileRows } from './cleaned-list'
import { createCsvReport, escapeCsvCell, formatCsv } from './csv'
import { createJsonReportData } from './json'

function image(id: string, path: string, decision: ImageFeatureRecord['decision']): ImageFeatureRecord {
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
      image('ref', 'Ordner/Referenz.jpg', 'unreviewed'),
      image('dup', '=HYPERLINK("bad")', 'duplicate'),
      image('later', 'Ordner/Später.jpg', 'later'),
      image('single', 'Andere/Einzel.jpg', 'unreviewed'),
    ],
    edges: [{
      id: 'edge-1',
      sourceId: 'ref',
      targetId: 'dup',
      strong: true,
      score: 96,
      confidence: 'very-high',
      category: 'almost-certain-duplicate',
      reasons: ['sehr ähnlich'],
      metrics: { pHashDistance: 1, dHashDistance: 2, ssim: 0.98, histogramSimilarity: 0.9 },
    }],
    groups: [{
      id: 'gruppe-1',
      referenceId: 'ref',
      memberIds: ['ref', 'dup'],
      uncertainIds: ['later'],
      edgeIds: ['edge-1'],
      status: 'unreviewed',
    }],
    errors: [],
  }
}

describe('CSV-Export', () => {
  it('schreibt BOM, CRLF und korrekte CSV-Escapes', () => {
    expect(formatCsv([['a;b', 'sagt "ja"', 'Zeile\n2']])).toBe('\ufeff"a;b";"sagt ""ja""";"Zeile\n2"\r\n')
    expect(createCsvReport(resultFixture()).startsWith('\ufeff')).toBe(true)
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
    expect(report.exportVersion).toBe(1)
    expect(report.edges[0]?.metrics.ssim).toBe(0.98)
    expect(report.images[0]).not.toHaveProperty('gray')
  })

  it('trennt behaltene, bestätigte und ungeklärte Dateien nachvollziehbar', () => {
    const rows = createCleanedFileRows(resultFixture())
    expect(rows.find((row) => row.name === 'Referenz.jpg')?.category).toBe('behalten')
    expect(rows.find((row) => row.decision === 'duplicate')?.category).toBe('bestätigtes-duplikat')
    expect(rows.find((row) => row.decision === 'later')?.category).toBe('ungeklärt')
    expect(rows.find((row) => row.name === 'Einzel.jpg')?.category).toBe('behalten')
  })
})
