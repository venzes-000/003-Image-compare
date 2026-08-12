import * as UTIF from 'utif2'
import type { SupportedImageFormat } from '../types'

export interface DecodedSpecialImage {
  width: number
  height: number
  bitmap?: ImageBitmap
  rgba?: Uint8ClampedArray
}

export interface OrientedRgbaImage {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

function normalizeTiffOrientation(value: unknown): ExifOrientation {
  const candidate = Array.isArray(value) || value instanceof Uint8Array ? value[0] : value
  const numeric = typeof candidate === 'string' ? Number(candidate) : candidate
  return typeof numeric === 'number' && Number.isInteger(numeric) && numeric >= 1 && numeric <= 8
    ? numeric as ExifOrientation
    : 1
}

/**
 * Applies TIFF/EXIF orientation to decoded RGBA pixels. Orientations 5-8 swap
 * the output dimensions; 2, 4, 5 and 7 include a reflection.
 */
export function applyExifOrientationToRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  orientation: number,
): OrientedRgbaImage {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Image dimensions must be positive safe integers.')
  }
  if (rgba.length !== width * height * 4) {
    throw new RangeError(`Expected ${width * height * 4} RGBA values, received ${rgba.length}.`)
  }

  const normalizedOrientation = normalizeTiffOrientation(orientation)
  if (normalizedOrientation === 1) return { width, height, rgba }

  const swapsDimensions = normalizedOrientation >= 5
  const outputWidth = swapsDimensions ? height : width
  const outputHeight = swapsDimensions ? width : height
  const oriented = new Uint8ClampedArray(rgba.length)

  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    for (let sourceX = 0; sourceX < width; sourceX += 1) {
      let targetX: number
      let targetY: number
      switch (normalizedOrientation) {
        case 2:
          targetX = width - 1 - sourceX
          targetY = sourceY
          break
        case 3:
          targetX = width - 1 - sourceX
          targetY = height - 1 - sourceY
          break
        case 4:
          targetX = sourceX
          targetY = height - 1 - sourceY
          break
        case 5:
          targetX = sourceY
          targetY = sourceX
          break
        case 6:
          targetX = height - 1 - sourceY
          targetY = sourceX
          break
        case 7:
          targetX = height - 1 - sourceY
          targetY = width - 1 - sourceX
          break
        case 8:
          targetX = sourceY
          targetY = width - 1 - sourceX
          break
        default:
          targetX = sourceX
          targetY = sourceY
      }

      const sourceOffset = (sourceY * width + sourceX) * 4
      const targetOffset = (targetY * outputWidth + targetX) * 4
      oriented[targetOffset] = rgba[sourceOffset] ?? 0
      oriented[targetOffset + 1] = rgba[sourceOffset + 1] ?? 0
      oriented[targetOffset + 2] = rgba[sourceOffset + 2] ?? 0
      oriented[targetOffset + 3] = rgba[sourceOffset + 3] ?? 0
    }
  }

  return { width: outputWidth, height: outputHeight, rgba: oriented }
}

export function needsSpecialDecoder(format: SupportedImageFormat): boolean {
  return format === 'heic' || format === 'tiff'
}

export async function decodeSpecialImage(
  blob: Blob,
  buffer: ArrayBuffer,
  format: SupportedImageFormat,
): Promise<DecodedSpecialImage> {
  if (format === 'heic') {
    const { heicTo } = await import('heic-to/csp')
    const bitmap = await heicTo({
      blob,
      type: 'bitmap',
      options: { imageOrientation: 'from-image' },
    })
    return { width: bitmap.width, height: bitmap.height, bitmap }
  }
  if (format === 'tiff') {
    const directories = UTIF.decode(buffer)
    const first = directories[0]
    if (!first) throw new Error('Die TIFF-Datei enthält kein lesbares Bild.')
    UTIF.decodeImage(buffer, first)
    if (!first.width || !first.height) throw new Error('Die TIFF-Abmessungen sind ungültig.')
    return applyExifOrientationToRgba(
      new Uint8ClampedArray(UTIF.toRGBA8(first)),
      first.width,
      first.height,
      normalizeTiffOrientation(first.t274),
    )
  }
  throw new Error(`Für das Format ${format} ist kein Spezialdecoder erforderlich.`)
}
