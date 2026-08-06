import type { SupportedImageFormat } from '../types'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

export const IMAGE_MIME_TYPES: Record<SupportedImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function detectImageFormat(bytes: ArrayBuffer | ArrayBufferView): SupportedImageFormat | undefined {
  const data = toUint8Array(bytes)
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'jpeg'
  }
  if (data.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => data[index] === byte)) {
    return 'png'
  }
  if (
    data.length >= 12 &&
    asciiAt(data, 0, 'RIFF') &&
    asciiAt(data, 8, 'WEBP')
  ) {
    return 'webp'
  }
  return undefined
}

export function isZipMagic(bytes: ArrayBuffer | ArrayBufferView): boolean {
  const data = toUint8Array(bytes)
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b) return false
  const third = data[2]
  const fourth = data[3]
  return (
    (third === 0x03 && fourth === 0x04) ||
    (third === 0x05 && fourth === 0x06) ||
    (third === 0x07 && fourth === 0x08)
  )
}

export function formatFromFileName(path: string): SupportedImageFormat | undefined {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLocaleLowerCase('en-US')
  if (extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (extension === 'png') return 'png'
  if (extension === 'webp') return 'webp'
  return undefined
}

export function hasNestedZipExtension(path: string): boolean {
  return /\.(?:zip|zipx|jar|apk|epub)$/i.test(path)
}

export function imageFormatMatchesPath(path: string, bytes: ArrayBuffer | ArrayBufferView): boolean {
  const expected = formatFromFileName(path)
  return expected !== undefined && detectImageFormat(bytes) === expected
}

function asciiAt(data: Uint8Array, offset: number, expected: string): boolean {
  for (let index = 0; index < expected.length; index += 1) {
    if (data[offset + index] !== expected.charCodeAt(index)) return false
  }
  return true
}

function toUint8Array(value: ArrayBuffer | ArrayBufferView): Uint8Array {
  return value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}
