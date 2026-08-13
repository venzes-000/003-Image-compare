import { describe, expect, it } from 'vitest'
import { APP_LIMITS, createDefaultSettings, getDefaultWorkerCount, settingsForMode } from './limits'

describe('zentrale Anwendungsgrenzen', () => {
  it('verwendet die dokumentierten ZIP- und Speichergrenzen', () => {
    expect(APP_LIMITS.maxImages).toBe(10_000)
    expect(APP_LIMITS.recommendedImagesPerArchive).toBe(3_000)
    expect(APP_LIMITS.maxEntries).toBe(25_000)
    expect(APP_LIMITS.maxEntries).toBeGreaterThanOrEqual(APP_LIMITS.maxImages * 2)
    expect(APP_LIMITS.maxSingleImageBytes).toBe(75 * 1024 * 1024)
    expect(APP_LIMITS.maxTotalUncompressedBytes).toBe(20 * 1024 * 1024 * 1024)
    expect(APP_LIMITS.maxCompressionRatio).toBe(100)
    expect(APP_LIMITS.analysisSize).toBe(64)
    expect(APP_LIMITS.thumbnailMaxEdge).toBe(360)
  })

  it('ordnet sensible Modi nachvollziehbar und begrenzt Worker auf eins bis vier', () => {
    const strict = settingsForMode('strict', -4)
    const balanced = settingsForMode('balanced', 2)
    const sensitive = settingsForMode('sensitive', 99)
    expect(strict.workerCount).toBe(1)
    expect(sensitive.workerCount).toBe(4)
    expect(strict.pHashThreshold).toBeLessThan(balanced.pHashThreshold)
    expect(balanced.pHashThreshold).toBeLessThan(sensitive.pHashThreshold)
    expect(strict.minimumSsim).toBeGreaterThan(balanced.minimumSsim)
    expect(balanced.minimumSsim).toBeGreaterThan(sensitive.minimumSsim)
  })

  it('liefert einen vollständigen, sicheren Standardmodus', () => {
    const defaults = createDefaultSettings()
    expect(defaults.mode).toBe('balanced')
    expect(defaults.workerCount).toBe(getDefaultWorkerCount())
    expect(defaults.workerCount).toBeGreaterThanOrEqual(1)
    expect(defaults.workerCount).toBeLessThanOrEqual(4)
    expect(defaults.candidateLimitPerImage).toBeGreaterThan(0)
  })
})
