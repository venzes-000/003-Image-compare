import { describe, expect, it } from 'vitest'
import * as UTIF from 'utif2'
import { applyExifOrientationToRgba, decodeSpecialImage } from './specialDecoders'

const EXPECTED_PIXELS: Record<number, number[]> = {
  1: [1, 2, 3, 4, 5, 6],
  2: [3, 2, 1, 6, 5, 4],
  3: [6, 5, 4, 3, 2, 1],
  4: [4, 5, 6, 1, 2, 3],
  5: [1, 4, 2, 5, 3, 6],
  6: [4, 1, 5, 2, 6, 3],
  7: [6, 3, 5, 2, 4, 1],
  8: [3, 6, 2, 5, 1, 4],
}

function rgbaPixels(values: readonly number[]): Uint8ClampedArray {
  return Uint8ClampedArray.from(values.flatMap((value) => [value, value + 10, value + 20, 255]))
}

function firstChannels(rgba: Uint8ClampedArray): number[] {
  const values: number[] = []
  for (let offset = 0; offset < rgba.length; offset += 4) values.push(rgba[offset] ?? 0)
  return values
}

describe('applyExifOrientationToRgba', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'applies TIFF/EXIF orientation %i without losing or duplicating pixels',
    (orientation) => {
      const result = applyExifOrientationToRgba(rgbaPixels([1, 2, 3, 4, 5, 6]), 3, 2, orientation)

      expect([result.width, result.height]).toEqual(orientation >= 5 ? [2, 3] : [3, 2])
      expect(firstChannels(result.rgba)).toEqual(EXPECTED_PIXELS[orientation])
    },
  )

  it('keeps every RGBA channel together while reflecting pixels', () => {
    const result = applyExifOrientationToRgba(rgbaPixels([1, 2, 3, 4, 5, 6]), 3, 2, 7)
    expect([...result.rgba.slice(0, 4)]).toEqual([6, 16, 26, 255])
  })
})

describe('decodeSpecialImage TIFF orientation', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'reads and applies TIFF orientation tag %i',
    async (orientation) => {
      const source = rgbaPixels([1, 2, 3, 4, 5, 6])
      const buffer = UTIF.encodeImage(
        Uint8Array.from(source),
        3,
        2,
        { t274: [orientation] } as unknown as UTIF.IFD,
      )

      const result = await decodeSpecialImage(
        new Blob([buffer as ArrayBuffer], { type: 'image/tiff' }),
        buffer as ArrayBuffer,
        'tiff',
      )

      expect([result.width, result.height]).toEqual(orientation >= 5 ? [2, 3] : [3, 2])
      expect(firstChannels(result.rgba ?? new Uint8ClampedArray())).toEqual(EXPECTED_PIXELS[orientation])
    },
  )
})
