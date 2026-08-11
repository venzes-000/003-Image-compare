import * as UTIF from 'utif2'
import type { SupportedImageFormat } from '../types'

export interface DecodedSpecialImage {
  width: number
  height: number
  bitmap?: ImageBitmap
  rgba?: Uint8ClampedArray
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
    return {
      width: first.width,
      height: first.height,
      rgba: new Uint8ClampedArray(UTIF.toRGBA8(first)),
    }
  }
  throw new Error(`Für das Format ${format} ist kein Spezialdecoder erforderlich.`)
}
