import { describe, expect, it } from 'vitest'
import { APP_LIMITS } from '../config/limits'
import { ZipValidationError } from './errors'
import { validateZipEntries, type ZipEntryMetadataLike } from './validation'

function entry(
  filename: string,
  uncompressedSize = 1_000,
  compressedSize = 500,
  extra: Partial<ZipEntryMetadataLike> = {},
): ZipEntryMetadataLike {
  return { filename, directory: false, uncompressedSize, compressedSize, ...extra }
}

function expectCode(callback: () => unknown, code: ZipValidationError['code']): void {
  try {
    callback()
    throw new Error('Erwarteter Fehler wurde nicht ausgelöst')
  } catch (error) {
    expect(error).toBeInstanceOf(ZipValidationError)
    expect((error as ZipValidationError).code).toBe(code)
  }
}

describe('ZIP-Limitprüfung', () => {
  it('zählt unterstützte Bilder, behält Pfade und ignoriert Systemdateien', () => {
    const result = validateZipEntries([
      entry('Fotos/eins.JPG'),
      entry('__MACOSX/._eins.JPG'),
      entry('Notizen.txt'),
      entry('leer.png', 0, 0),
      entry('Fotos/', 0, 0, { directory: true }),
    ])
    expect(result.images).toMatchObject([{ path: 'Fotos/eins.JPG', name: 'eins.JPG', format: 'jpeg' }])
    expect(result.summary).toMatchObject({ totalEntries: 4, supportedImages: 1, skippedEntries: 3 })
    expect(result.summary.warnings).toHaveLength(3)
  })

  it('weist Traversal und doppelte, unter Windows kollidierende Pfade zurück', () => {
    expectCode(() => validateZipEntries([entry('../foto.jpg')]), 'unsafe-path')
    expectCode(() => validateZipEntries([entry('Fotos/Bild.jpg'), entry('fotos/bild.JPG')]), 'duplicate-path')
  })

  it('weist verschachtelte und verschlüsselte Archive zurück', () => {
    expectCode(() => validateZipEntries([entry('teil.zip')]), 'nested-zip')
    expectCode(() => validateZipEntries([entry('foto.jpg', 100, 50, { encrypted: true })]), 'encrypted-zip')
  })

  it('begrenzt Einträge, Bilder, Einzel- und Gesamtgröße', () => {
    expectCode(
      () => validateZipEntries([entry('a.jpg'), entry('b.jpg')], { maxEntries: 1 }),
      'too-many-entries',
    )
    expectCode(
      () => validateZipEntries([entry('a.jpg'), entry('b.jpg')], { maxImages: 1 }),
      'too-many-images',
    )
    expectCode(
      () => validateZipEntries([entry('a.jpg', 11, 10)], { maxSingleImageBytes: 10 }),
      'entry-too-large',
    )
    expectCode(
      () => validateZipEntries([entry('a.jpg', 6, 5), entry('text.txt', 6, 5)], { maxTotalUncompressedBytes: 10 }),
      'archive-too-large',
    )
  })

  it('erlaubt exakt 10.000 Bilder und blockiert das 10.001. Bild', () => {
    const atLimit = Array.from(
      { length: APP_LIMITS.maxImages },
      (_, index) => entry(`bild-${index.toString().padStart(5, '0')}.jpg`),
    )
    const directoryEntries = Array.from(
      { length: 100 },
      (_, index) => entry(`ordner-${index}/`, 0, 0, { directory: true }),
    )
    expect(validateZipEntries([...directoryEntries, ...atLimit]).images).toHaveLength(APP_LIMITS.maxImages)
    expectCode(
      () => validateZipEntries([...atLimit, entry('bild-10000.jpg')]),
      'too-many-images',
    )
  })

  it('begrenzt ZIP-Dateien auf 25.000 Einträge', () => {
    const atLimit = Array.from(
      { length: APP_LIMITS.maxEntries },
      (_, index) => entry(`begleitdatei-${index}.txt`),
    )
    expect(validateZipEntries(atLimit).summary.totalEntries).toBe(APP_LIMITS.maxEntries)
    expectCode(
      () => validateZipEntries([...atLimit, entry('eine-zu-viel.txt')]),
      'too-many-entries',
    )
  })

  it('blockiert extreme oder unmögliche Kompressionsverhältnisse', () => {
    expectCode(
      () => validateZipEntries([entry('a.jpg', 1_001, 10)], { maxCompressionRatio: 100 }),
      'compression-ratio',
    )
    expectCode(() => validateZipEntries([entry('a.jpg', 10, 0)]), 'compression-ratio')
  })
})
