import { describe, expect, it } from 'vitest'
import { settingsForMode } from '../config/limits'
import {
  isPlausibleLegacyQuarterTurnCandidate,
  isPlausibleVisualCandidate,
} from '../similarity/assessment'
import type { ImageFeatureRecord } from '../types'
import { createFeatureRecord } from './featureExtraction'
import {
  createRotatedHashVariants,
  findBestRotationAlignment,
  rotateGrayQuarterTurn,
} from './rotationFeatures'

function asymmetricAnalysisImage(): Uint8Array {
  return Uint8Array.from({ length: 64 * 64 }, (_, index) => {
    const x = index % 64
    const y = Math.floor(index / 64)
    if (x < 13 && y < 28) return 235
    if (x > 39 && y > 46) return 18
    if (Math.abs(y - Math.floor(x * 0.57 + 7)) < 2) return 162
    return (x * 17 + y * 31 + ((x ^ y) % 19) * 7) % 256
  })
}

function feature(id: string, gray: Uint8Array, aspectRatio: number): ImageFeatureRecord {
  const variants = createRotatedHashVariants(gray, 64, 64, aspectRatio)
  const primary = variants[0]
  if (!primary) throw new Error('Missing primary variant')
  return {
    id,
    path: `${id}.jpg`,
    name: `${id}.jpg`,
    size: 1,
    compressedSize: 1,
    mime: 'image/jpeg',
    format: 'jpeg',
    width: aspectRatio >= 1 ? 4000 : 3000,
    height: aspectRatio >= 1 ? 3000 : 4000,
    aspectRatio,
    aHash: primary.aHash,
    dHash: primary.dHash,
    pHash: primary.pHash,
    rotationVariants: variants,
    histogram: [1],
    luminanceMean: 0.5,
    gray,
    thumbnailKey: `${id}:thumbnail`,
    decision: 'unreviewed',
  }
}

describe('rotateGrayQuarterTurn', () => {
  it('rotates a rectangular image clockwise without losing pixels', () => {
    const source = Uint8Array.from([
      1, 2, 3,
      4, 5, 6,
    ])

    expect([...rotateGrayQuarterTurn(source, 3, 2, 90).gray]).toEqual([
      4, 1,
      5, 2,
      6, 3,
    ])
    expect([...rotateGrayQuarterTurn(source, 3, 2, 180).gray]).toEqual([
      6, 5, 4,
      3, 2, 1,
    ])
    expect([...rotateGrayQuarterTurn(source, 3, 2, 270).gray]).toEqual([
      3, 6,
      2, 5,
      1, 4,
    ])
  })
})

describe('rotation-aware image features', () => {
  it('creates all quarter-turn variants from one downscaled image', () => {
    const variants = createRotatedHashVariants(asymmetricAnalysisImage(), 64, 64, 4 / 3)
    expect(variants.map((variant) => variant.rotationDegrees)).toEqual([0, 90, 180, 270])
    expect(variants.map((variant) => variant.aspectRatio)).toEqual([4 / 3, 3 / 4, 4 / 3, 3 / 4])
  })

  it('withholds variants when callers cannot guarantee display-orientation decoding', () => {
    const imageData = { data: new Uint8ClampedArray(64 * 64 * 4), width: 64, height: 64 } as ImageData
    const record = createFeatureRecord(
      {
        id: 'raw-oriented',
        path: 'raw-oriented.jpg',
        name: 'raw-oriented.jpg',
        size: 1,
        compressedSize: 1,
        mime: 'image/jpeg',
        format: 'jpeg',
      },
      4000,
      3000,
      imageData,
      { orientation: 6, warnings: [] },
      false,
    )
    expect(record.rotationVariants).toBeUndefined()
  })

  it('aligns a portrait/landscape representation before the candidate gate', () => {
    const landscapeGray = asymmetricAnalysisImage()
    const portraitGray = rotateGrayQuarterTurn(landscapeGray, 64, 64, 90).gray
    const landscape = feature('landscape', landscapeGray, 4 / 3)
    const portrait = feature('portrait', portraitGray, 3 / 4)

    const alignment = findBestRotationAlignment(landscape, portrait)

    expect(alignment.targetRotationDegrees).toBe(270)
    expect(alignment.aHashDistance).toBe(0)
    expect(alignment.dHashDistance).toBe(0)
    expect(alignment.pHashDistance).toBe(0)
    expect(alignment.aspectRatioDifference).toBeCloseTo(0, 12)
    expect(isPlausibleVisualCandidate(
      { ...alignment, luminanceDifference: 0 },
      settingsForMode('balanced', 2),
    )).toBe(true)
  })

  it('remains backwards compatible with cached records without variants', () => {
    const base = feature('base', asymmetricAnalysisImage(), 4 / 3)
    const cached = { ...base, id: 'cached', rotationVariants: undefined }
    const alignment = findBestRotationAlignment(base, cached)
    expect(alignment).toMatchObject({
      targetRotationDegrees: 0,
      aHashDistance: 0,
      dHashDistance: 0,
      pHashDistance: 0,
      aspectRatioDifference: 0,
    })
  })

  it('narrowly rescues a reciprocal-aspect legacy candidate for rotated SSIM', () => {
    const metrics = {
      aHashDistance: 33,
      dHashDistance: 30,
      pHashDistance: 38,
      aspectRatioDifference: 0.4375,
      luminanceDifference: 0.02,
    }
    expect(isPlausibleVisualCandidate(metrics, settingsForMode('balanced', 2))).toBe(false)
    expect(isPlausibleLegacyQuarterTurnCandidate(metrics, 4 / 3, 3 / 4)).toBe(true)
    expect(isPlausibleLegacyQuarterTurnCandidate(metrics, 4 / 3, 1)).toBe(false)
  })
})
