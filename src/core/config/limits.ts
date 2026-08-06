import type { AnalysisSettings, SensitivityMode } from '../types'

const MIB = 1024 * 1024
const GIB = 1024 * MIB

export const APP_LIMITS = Object.freeze({
  maxImages: 3_000,
  maxEntries: 10_000,
  maxSingleImageBytes: 75 * MIB,
  maxTotalUncompressedBytes: 20 * GIB,
  maxCompressionRatio: 100,
  analysisSize: 64,
  hashInputSize: 32,
  thumbnailMaxEdge: 360,
  zipFingerprintChunkBytes: 64 * 1024,
  databaseVersion: 1,
})

export const MODE_DEFAULTS: Record<SensitivityMode, Omit<AnalysisSettings, 'mode' | 'workerCount'>> = {
  strict: {
    pHashThreshold: 8,
    dHashThreshold: 8,
    aHashThreshold: 8,
    minimumSsim: 0.92,
    minimumHistogramSimilarity: 0.8,
    candidateLimitPerImage: 12,
  },
  balanced: {
    pHashThreshold: 14,
    dHashThreshold: 14,
    aHashThreshold: 14,
    minimumSsim: 0.82,
    minimumHistogramSimilarity: 0.65,
    candidateLimitPerImage: 20,
  },
  sensitive: {
    pHashThreshold: 20,
    dHashThreshold: 20,
    aHashThreshold: 20,
    minimumSsim: 0.68,
    minimumHistogramSimilarity: 0.45,
    candidateLimitPerImage: 32,
  },
}

export function getDefaultWorkerCount(): number {
  const cores = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2
  return Math.min(Math.max(1, cores - 1), 4)
}

export function createDefaultSettings(mode: SensitivityMode = 'balanced'): AnalysisSettings {
  return { mode, workerCount: getDefaultWorkerCount(), ...MODE_DEFAULTS[mode] }
}

export function settingsForMode(mode: SensitivityMode, workerCount = getDefaultWorkerCount()): AnalysisSettings {
  return { mode, workerCount: Math.min(4, Math.max(1, workerCount)), ...MODE_DEFAULTS[mode] }
}
