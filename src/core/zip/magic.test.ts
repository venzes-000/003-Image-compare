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

  it('erkennt die üblichen ZIP-Signaturen', () => {
    expect(isZipMagic(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true)
    expect(isZipMagic(Uint8Array.from([0x50, 0x4b, 0x05, 0x06]))).toBe(true)
    expect(isZipMagic(Uint8Array.from([0x50, 0x4b, 0x00, 0x00]))).toBe(false)
  })
})
