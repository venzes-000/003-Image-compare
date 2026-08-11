import { describe, expect, it } from 'vitest'
import { settingsForMode } from '../../config/limits'
import type { CaptureMetadata } from '../../types'
import { assessMetadata, calculateSimilarityAssessment, haversineDistanceMeters } from '..'

function metadata(overrides: Partial<CaptureMetadata> = {}): CaptureMetadata {
  return { warnings: [], ...overrides }
}

describe('haversineDistanceMeters', () => {
  it('returns zero for identical coordinates', () => {
    expect(haversineDistanceMeters(52.516275, 13.377704, 52.516275, 13.377704)).toBe(0)
  })

  it('calculates a known short distance at the equator', () => {
    expect(haversineDistanceMeters(0, 0, 0, 0.001)).toBeCloseTo(111.2, 0)
  })

  it('uses the short path across the antimeridian', () => {
    expect(haversineDistanceMeters(0, 179.999, 0, -179.999)).toBeCloseTo(222.4, 0)
  })

  it('rejects non-finite and out-of-range coordinates', () => {
    expect(() => haversineDistanceMeters(Number.NaN, 0, 0, 0)).toThrow(/finite/)
    expect(() => haversineDistanceMeters(91, 0, 0, 0)).toThrow(/valid range/)
    expect(() => haversineDistanceMeters(0, -181, 0, 0)).toThrow(/valid range/)
  })
})

describe('assessMetadata', () => {
  it('marks matching location and capture time as corroborating context', () => {
    const left = metadata({
      latitude: 52.516275,
      longitude: 13.377704,
      capturedAt: '2026-08-10T10:00:00+02:00',
      captureTimeHasTimezone: true,
      cameraMake: 'Apple',
      cameraModel: 'iPhone 15 Pro',
    })
    const right = metadata({
      latitude: 52.51628,
      longitude: 13.37771,
      capturedAt: '2026-08-10T08:00:01Z',
      captureTimeHasTimezone: true,
      cameraMake: ' apple ',
      cameraModel: '  IPHONE   15 PRO ',
    })

    const assessment = assessMetadata(left, right)

    expect(assessment.status).toBe('corroborates')
    expect(assessment.contextScore).toBeGreaterThan(95)
    expect(assessment.gpsDistanceMeters).toBeLessThan(1)
    expect(assessment.captureTimeDifferenceSeconds).toBe(1)
    expect(assessment.sameCameraModel).toBe(true)
    expect(assessment.reasons.join(' ')).toMatch(/GPS.*Aufnahmezeiten.*Kamera/is)
  })

  it('keeps a single weak contextual match neutral', () => {
    const assessment = assessMetadata(
      metadata({ cameraMake: 'Canon', cameraModel: 'EOS R5' }),
      metadata({ cameraMake: 'CANON', cameraModel: 'EOS   R5' }),
    )

    expect(assessment).toMatchObject({
      status: 'neutral',
      contextScore: 100,
      sameCameraModel: true,
    })
  })

  it('flags reliable location and time conflicts without hiding their measurements', () => {
    const assessment = assessMetadata(
      metadata({
        latitude: 52.52,
        longitude: 13.405,
        capturedAt: '2026-08-01T10:00:00+02:00',
        captureTimeHasTimezone: true,
      }),
      metadata({
        latitude: 48.137,
        longitude: 11.575,
        capturedAt: '2026-08-10T10:00:00+02:00',
        captureTimeHasTimezone: true,
      }),
    )

    expect(assessment.status).toBe('conflicts')
    expect(assessment.gpsDistanceMeters).toBeGreaterThan(500_000)
    expect(assessment.captureTimeDifferenceSeconds).toBe(9 * 86_400)
    expect(assessment.contextScore).toBeLessThan(1)
    expect(assessment.reasons.join(' ')).toMatch(/GPS.*Aufnahmezeiten/is)
  })

  it('does not treat a large naive-time difference as a reliable conflict', () => {
    const assessment = assessMetadata(
      metadata({ capturedAt: '2026-08-01T10:00:00', captureTimeHasTimezone: false }),
      metadata({ capturedAt: '2026-08-10T10:00:00', captureTimeHasTimezone: false }),
    )

    expect(assessment.status).toBe('neutral')
    expect(assessment.captureTimeDifferenceSeconds).toBe(9 * 86_400)
  })

  it('returns unavailable when no comparable metadata exists', () => {
    expect(assessMetadata(undefined, metadata())).toMatchObject({ status: 'unavailable' })
    expect(assessMetadata(metadata({ cameraMake: 'Canon' }), metadata({ software: 'Editor' }))).toEqual({
      status: 'unavailable',
      reasons: ['Keine gemeinsam vergleichbaren EXIF-Metadaten vorhanden.'],
    })
  })

  it('does not alter the visual similarity assessment', () => {
    const metrics = {
      aHashDistance: 5,
      dHashDistance: 6,
      pHashDistance: 4,
      ssim: 0.94,
      histogramSimilarity: 0.9,
      aspectRatioDifference: 0.01,
      resolutionRatio: 1,
    }
    const settings = settingsForMode('balanced', 2)
    const before = calculateSimilarityAssessment(metrics, settings)

    const context = assessMetadata(
      metadata({ latitude: 52.52, longitude: 13.405 }),
      metadata({ latitude: 48.137, longitude: 11.575 }),
    )
    const after = calculateSimilarityAssessment(metrics, settings)

    expect(context.status).toBe('conflicts')
    expect(after).toEqual(before)
  })
})
