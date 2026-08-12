import { describe, expect, it } from 'vitest'
import { settingsForMode } from '../../config/limits'
import {
  calculateGlobalSsim,
  calculateSimilarityAssessment,
  compareHistograms,
} from '..'

describe('compareHistograms', () => {
  it('normalizes histograms and returns bounded similarities', () => {
    expect(compareHistograms([1, 2, 1], [2, 4, 2])).toBeCloseTo(1, 12)
    expect(compareHistograms([1, 0, 0], [0, 0, 5])).toBe(0)
    expect(compareHistograms([0, 0], [0, 0])).toBe(1)
  })

  it('rejects incompatible or invalid histograms', () => {
    expect(() => compareHistograms([1], [1, 0])).toThrow(/same number/)
    expect(() => compareHistograms([1, -1], [1, 1])).toThrow(/non-negative/)
    expect(() => compareHistograms([], [])).toThrow(/at least one bin/)
  })
})

describe('calculateGlobalSsim', () => {
  it('returns one for identical 64 x 64 luminance images', () => {
    const image = Uint8Array.from({ length: 64 * 64 }, (_, index) => index % 251)
    expect(calculateGlobalSsim(image, image.slice())).toBe(1)
  })

  it('tolerates a small brightness change but rejects inverse structure', () => {
    const checker = Uint8Array.from({ length: 64 * 64 }, (_, index) => {
      const x = index % 64
      const y = Math.floor(index / 64)
      return (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 45 : 195
    })
    const brighter = checker.map((value) => value + 10)
    const inverse = checker.map((value) => 240 - value)
    expect(calculateGlobalSsim(checker, brighter)).toBeGreaterThan(0.98)
    expect(calculateGlobalSsim(checker, inverse)).toBeLessThan(0)
  })

  it('requires the pipeline analysis size', () => {
    expect(() => calculateGlobalSsim(new Uint8Array(16), new Uint8Array(16))).toThrow(/64 x 64/)
  })
})

describe('calculateSimilarityAssessment', () => {
  const strongMetrics = {
    aHashDistance: 1,
    dHashDistance: 2,
    pHashDistance: 2,
    ssim: 0.97,
    histogramSimilarity: 0.94,
    aspectRatioDifference: 0.01,
    resolutionRatio: 0.5,
  }

  it('classifies independently corroborated evidence with a transparent score', () => {
    const assessment = calculateSimilarityAssessment(strongMetrics, settingsForMode('balanced', 2))
    expect(assessment.score).toBeGreaterThanOrEqual(94)
    expect(assessment.category).toBe('almost-certain-duplicate')
    expect(assessment.confidence).toBe('very-high')
    expect(assessment.reasons.join(' ')).toMatch(/pHash-Abstand.*SSIM.*Histogramm/s)
    expect(assessment.metrics).toEqual(strongMetrics)
  })

  it('applies the selected sensitivity mode to borderline evidence', () => {
    const borderline = {
      aHashDistance: 12,
      dHashDistance: 12,
      pHashDistance: 12,
      ssim: 0.85,
      histogramSimilarity: 0.7,
      aspectRatioDifference: 0.04,
      resolutionRatio: 0.5,
    }
    const strict = calculateSimilarityAssessment(borderline, settingsForMode('strict', 2))
    const balanced = calculateSimilarityAssessment(borderline, settingsForMode('balanced', 2))
    const sensitive = calculateSimilarityAssessment(borderline, settingsForMode('sensitive', 2))
    expect(strict.category).toBe('probably-different')
    expect(balanced.category).toBe('probable-duplicate')
    expect(sensitive.category).toBe('probable-duplicate')
  })

  it('does not emit a review candidate from one hash metric alone', () => {
    const assessment = calculateSimilarityAssessment(
      { pHashDistance: 0 },
      settingsForMode('balanced', 1),
    )
    expect(assessment.score).toBe(100)
    expect(assessment.category).toBe('probably-different')
    expect(assessment.confidence).toBe('low')
  })

  it('does not emit a review candidate from a matching histogram alone', () => {
    const assessment = calculateSimilarityAssessment(
      { histogramSimilarity: 1 },
      settingsForMode('balanced', 1),
    )
    expect(assessment.score).toBe(100)
    expect(assessment.category).toBe('probably-different')
    expect(assessment.confidence).toBe('low')
  })

  it('rejects the weak single-scene evidence seen in false-positive construction photos', () => {
    const assessment = calculateSimilarityAssessment(
      {
        aHashDistance: 14,
        dHashDistance: 21,
        pHashDistance: 17,
        ssim: 0.74,
        histogramSimilarity: 0.79,
        aspectRatioDifference: 0.01,
        resolutionRatio: 0.9,
      },
      settingsForMode('balanced', 1),
    )
    expect(assessment.score).toBeGreaterThanOrEqual(60)
    expect(assessment.category).toBe('probably-different')
  })

  it('marks conflicting evidence as probably different', () => {
    const assessment = calculateSimilarityAssessment(
      {
        aHashDistance: 40,
        dHashDistance: 38,
        pHashDistance: 42,
        ssim: 0.2,
        histogramSimilarity: 0.1,
        aspectRatioDifference: 0.5,
      },
      settingsForMode('balanced', 2),
    )
    expect(assessment.score).toBeLessThan(40)
    expect(assessment.category).toBe('probably-different')
  })

  it('rejects impossible metric values', () => {
    expect(() =>
      calculateSimilarityAssessment({ pHashDistance: 65 }, settingsForMode('balanced', 2)),
    ).toThrow(/between 0 and 64/)
  })
})
