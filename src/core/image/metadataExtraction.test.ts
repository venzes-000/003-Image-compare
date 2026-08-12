import { describe, expect, it } from 'vitest'
import { normalizeExifOrientation } from './metadataExtraction'

describe('normalizeExifOrientation', () => {
  it('accepts all numeric EXIF orientation values', () => {
    for (let orientation = 1; orientation <= 8; orientation += 1) {
      expect(normalizeExifOrientation(orientation)).toBe(orientation)
      expect(normalizeExifOrientation(String(orientation))).toBe(orientation)
    }
  })

  it('accepts every human-readable orientation emitted by exifr', () => {
    expect(normalizeExifOrientation('Horizontal (normal)')).toBe(1)
    expect(normalizeExifOrientation('Mirror horizontal')).toBe(2)
    expect(normalizeExifOrientation('Rotate 180')).toBe(3)
    expect(normalizeExifOrientation('Mirror vertical')).toBe(4)
    expect(normalizeExifOrientation('Mirror horizontal and rotate 270 CW')).toBe(5)
    expect(normalizeExifOrientation('Rotate 90 CW')).toBe(6)
    expect(normalizeExifOrientation('Mirror horizontal and rotate 90 CW')).toBe(7)
    expect(normalizeExifOrientation('Rotate 270 CW')).toBe(8)
  })

  it('normalizes harmless whitespace and rejects malformed values', () => {
    expect(normalizeExifOrientation('  ROTATE   90 cw ')).toBe(6)
    expect(normalizeExifOrientation(0)).toBeUndefined()
    expect(normalizeExifOrientation(9)).toBeUndefined()
    expect(normalizeExifOrientation(1.5)).toBeUndefined()
    expect(normalizeExifOrientation('sideways')).toBeUndefined()
  })
})
