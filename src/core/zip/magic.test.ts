import { describe, expect, it } from 'vitest'
import {
  detectImageFormat,
  formatFromFileName,
  imageFormatMatchesPath,
  isZipMagic,
} from './magic'

describe('Bildsignaturen', () => {
  it('erkennt JPEG, PNG und WebP anhand der Magic Bytes', () => {
    expect(detectImageFormat(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
    expect(detectImageFormat(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png')
    expect(detectImageFormat(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBP'))).toBe('webp')
  })

  it('vertraut nicht allein auf die Dateiendung', () => {
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])
    expect(formatFromFileName('foto.PNG')).toBe('png')
    expect(imageFormatMatchesPath('foto.png', jpeg)).toBe(false)
    expect(imageFormatMatchesPath('foto.jpeg', jpeg)).toBe(true)
  })

  it('erkennt HEIC/HEIF- und AVIF-Container anhand ihrer ISO-BMFF-Marken', () => {
    expect(detectImageFormat(isoBmff('heic'))).toBe('heic')
    expect(detectImageFormat(isoBmff('mif1', 'heix'))).toBe('heic')
    expect(detectImageFormat(isoBmff('avif'))).toBe('avif')
    expect(detectImageFormat(isoBmff('avis'))).toBe('avif')
    expect(detectImageFormat(isoBmff('isom'))).toBeUndefined()
  })

  it('erkennt GIF, BMP und beide TIFF-Byte-Reihenfolgen', () => {
    expect(detectImageFormat(new TextEncoder().encode('GIF87a'))).toBe('gif')
    expect(detectImageFormat(new TextEncoder().encode('GIF89a'))).toBe('gif')
    expect(detectImageFormat(Uint8Array.from([0x42, 0x4d, 0, 0]))).toBe('bmp')
    expect(detectImageFormat(Uint8Array.from([0x49, 0x49, 0x2a, 0x00]))).toBe('tiff')
    expect(detectImageFormat(Uint8Array.from([0x4d, 0x4d, 0x00, 0x2a]))).toBe('tiff')
  })

  it('ordnet die neuen Dateiendungen ihren kanonischen Formaten zu', () => {
    expect(formatFromFileName('aufnahme.HEIC')).toBe('heic')
    expect(formatFromFileName('aufnahme.heif')).toBe('heic')
    expect(formatFromFileName('aufnahme.hif')).toBe('heic')
    expect(formatFromFileName('aufnahme.avif')).toBe('avif')
    expect(formatFromFileName('animation.gif')).toBe('gif')
    expect(formatFromFileName('scan.bmp')).toBe('bmp')
    expect(formatFromFileName('scan.dib')).toBe('bmp')
    expect(formatFromFileName('scan.tif')).toBe('tiff')
    expect(formatFromFileName('scan.tiff')).toBe('tiff')
  })

  it('prüft auch bei den neuen Formaten Endung und Inhalt gemeinsam', () => {
    expect(imageFormatMatchesPath('aufnahme.heif', isoBmff('heic'))).toBe(true)
    expect(imageFormatMatchesPath('aufnahme.avif', isoBmff('avif'))).toBe(true)
    expect(imageFormatMatchesPath('aufnahme.heic', isoBmff('avif'))).toBe(false)
    expect(imageFormatMatchesPath('animation.gif', new TextEncoder().encode('GIF89a'))).toBe(true)
    expect(imageFormatMatchesPath('scan.tiff', Uint8Array.from([0x49, 0x49, 0x2a, 0x00]))).toBe(true)
  })

  it('erkennt die üblichen ZIP-Signaturen', () => {
    expect(isZipMagic(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true)
    expect(isZipMagic(Uint8Array.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true)
    expect(isZipMagic(Uint8Array.from([0x50, 0x4b, 0x00, 0x00]))).toBe(false)
  })
})

function isoBmff(majorBrand: string, ...compatibleBrands: string[]): Uint8Array {
  const brands = [majorBrand, ...compatibleBrands]
  const size = 16 + compatibleBrands.length * 4
  const bytes = new Uint8Array(size)
  bytes[0] = (size >>> 24) & 0xff
  bytes[1] = (size >>> 16) & 0xff
  bytes[2] = (size >>> 8) & 0xff
  bytes[3] = size & 0xff
  bytes.set(new TextEncoder().encode('ftyp'), 4)
  bytes.set(new TextEncoder().encode(brands.join('')), 8)
  return bytes
}
