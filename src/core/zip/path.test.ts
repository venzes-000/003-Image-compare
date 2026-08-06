import { describe, expect, it } from 'vitest'
import {
  isIgnoredZipPath,
  isSafeZipPath,
  normalizeZipPath,
  UnsafeZipPathError,
  zipPathComparisonKey,
} from './path'

describe('normalizeZipPath', () => {
  it('normalisiert relative Windows- und Punktpfade', () => {
    expect(normalizeZipPath('.\\Baustelle\\Fotos//bild.jpg')).toBe('Baustelle/Fotos/bild.jpg')
  })

  it.each([
    '../bild.jpg',
    'ordner/../../bild.jpg',
    '/absolut/bild.jpg',
    '\\server\\freigabe\\bild.jpg',
    'C:\\bilder\\bild.jpg',
    'ordner/\u0000bild.jpg',
  ])('weist den unsicheren Pfad %j zurück', (path) => {
    expect(() => normalizeZipPath(path)).toThrow(UnsafeZipPathError)
    expect(isSafeZipPath(path)).toBe(false)
  })

  it('erzeugt für Windows-kollidierende Groß-/Kleinschreibung denselben Schlüssel', () => {
    expect(zipPathComparisonKey('Fotos/BILD.JPG')).toBe(zipPathComparisonKey('fotos/bild.jpg'))
  })

  it('erkennt typische Metadaten- und Systempfade', () => {
    expect(isIgnoredZipPath('__MACOSX/Fotos/._bild.jpg')).toBe(true)
    expect(isIgnoredZipPath('Fotos/.DS_Store')).toBe(true)
    expect(isIgnoredZipPath('Fotos/bild.jpg')).toBe(false)
  })
})
