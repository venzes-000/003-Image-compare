import {
  BlobReader,
  BlobWriter,
  ZipReader,
  type Entry,
  type FileEntry,
  type ZipReaderConstructorOptions,
} from '@zip.js/zip.js'
import type { AppError, SupportedImageFormat } from '../types'
import { ZipValidationError, zipErrorToAppError } from './errors'
import { detectImageFormat, IMAGE_MIME_TYPES, isZipMagic } from './magic'
import { normalizeZipPath } from './path'
import {
  validateZipEntries,
  type SafeZipImageEntry,
  type ZipInspection,
  type ZipSafetyLimits,
} from './validation'

export interface ZipImageData extends SafeZipImageEntry {
  blob: Blob
  mime: string
}

export interface ZipReadProgress {
  processed: number
  total: number
  path: string
  percent: number
}

export interface ZipReaderServiceOptions {
  limits?: Partial<ZipSafetyLimits>
  signal?: AbortSignal
  useWebWorkers?: boolean
  onProgress?: (progress: ZipReadProgress) => void
}

export interface ZipReadResult {
  inspection: ZipInspection
  errors: AppError[]
  processedImages: number
}

export type ZipImageHandler = (image: ZipImageData) => void | Promise<void>

/**
 * Opens one archive at a time and awaits each image handler before extracting
 * the next image. This bounds peak memory to roughly one original image plus
 * the consumer's small analysis/thumbnail data.
 */
export class ZipArchiveService {
  async inspect(file: Blob, options: ZipReaderServiceOptions = {}): Promise<ZipInspection> {
    throwIfAborted(options.signal)
    const reader = createReader(file, options.useWebWorkers)
    try {
      const entries = await reader.getEntries()
      throwIfAborted(options.signal)
      return validateZipEntries(entries, options.limits)
    } catch (error) {
      throw normalizeReaderError(error)
    } finally {
      await closeReader(reader)
    }
  }

  async readImages(
    file: Blob,
    onImage: ZipImageHandler,
    options: ZipReaderServiceOptions = {},
  ): Promise<ZipReadResult> {
    throwIfAborted(options.signal)
    const reader = createReader(file, options.useWebWorkers)
    try {
      const entries = await reader.getEntries()
      const validated = validateZipEntries(entries, options.limits)
      const inspection = cloneInspection(validated)
      const errors: AppError[] = []
      let processedImages = 0

      for (const imageInfo of inspection.images) {
        throwIfAborted(options.signal)
        const entry = entries[imageInfo.index]
        if (entry === undefined || entry.directory) {
          const error = new ZipValidationError(
            'corrupt-entry',
            `Der ZIP-Eintrag „${imageInfo.path}“ kann nicht gelesen werden.`,
            { path: imageInfo.path },
          )
          errors.push(zipErrorToAppError(error))
          inspection.summary.corruptedImages += 1
          continue
        }

        let image: ZipImageData
        try {
          image = await extractAndValidateImage(entry, imageInfo, options.signal, options.useWebWorkers)
        } catch (error) {
          if (isCancellation(error) || isFatalValidationError(error)) throw normalizeReaderError(error, imageInfo.path)
          errors.push(zipErrorToAppError(normalizeEntryError(error, imageInfo.path)))
          inspection.summary.corruptedImages += 1
          continue
        }

        await onImage(image)
        processedImages += 1
        options.onProgress?.({
          processed: processedImages,
          total: inspection.images.length,
          path: imageInfo.path,
          percent: inspection.images.length === 0 ? 100 : Math.round((processedImages / inspection.images.length) * 100),
        })
      }

      if (inspection.summary.corruptedImages > 0) {
        inspection.summary.warnings.push(
          `${inspection.summary.corruptedImages.toLocaleString('de-DE')} beschädigte oder falsch benannte Bilddatei(en) wurden übersprungen.`,
        )
      }
      return { inspection, errors, processedImages }
    } catch (error) {
      throw normalizeReaderError(error)
    } finally {
      await closeReader(reader)
    }
  }

  async extractImage(file: Blob, requestedPath: string, options: ZipReaderServiceOptions = {}): Promise<ZipImageData> {
    const path = normalizeZipPath(requestedPath)
    throwIfAborted(options.signal)
    const reader = createReader(file, options.useWebWorkers)
    try {
      const entries = await reader.getEntries()
      const inspection = validateZipEntries(entries, options.limits)
      const imageInfo = inspection.images.find((image) => image.path === path)
      if (imageInfo === undefined) {
        throw new ZipValidationError('corrupt-entry', `Das Bild „${path}“ wurde in der ZIP-Datei nicht gefunden.`, { path })
      }
      const entry = entries[imageInfo.index]
      if (entry === undefined || entry.directory) {
        throw new ZipValidationError('corrupt-entry', `Das Bild „${path}“ kann nicht gelesen werden.`, { path })
      }
      return await extractAndValidateImage(entry, imageInfo, options.signal, options.useWebWorkers)
    } catch (error) {
      throw normalizeReaderError(error, path)
    } finally {
      await closeReader(reader)
    }
  }
}

export const sequentialZipReader = new ZipArchiveService()
export const zipArchiveService = sequentialZipReader

export function inspectZip(file: Blob, options?: ZipReaderServiceOptions): Promise<ZipInspection> {
  return sequentialZipReader.inspect(file, options)
}

export function readZipImages(
  file: Blob,
  onImage: ZipImageHandler,
  options?: ZipReaderServiceOptions,
): Promise<ZipReadResult> {
  return sequentialZipReader.readImages(file, onImage, options)
}

async function extractAndValidateImage(
  entry: FileEntry,
  imageInfo: SafeZipImageEntry,
  signal: AbortSignal | undefined,
  useWebWorkers: boolean | undefined,
): Promise<ZipImageData> {
  throwIfAborted(signal)
  const writer = new BlobWriter(IMAGE_MIME_TYPES[imageInfo.format])
  const extractionOptions = {
    checkSignature: true,
    checkAmbiguity: true,
    checkOverlappingEntry: true,
    strictness: 'strict',
    ...(signal === undefined ? {} : { signal }),
    ...(useWebWorkers === undefined ? {} : { useWebWorkers }),
  } as const
  const blob = await entry.getData(writer, extractionOptions)
  throwIfAborted(signal)

  if (blob.size !== imageInfo.uncompressedSize) {
    throw new ZipValidationError(
      'corrupt-entry',
      `Die gelesene Größe von „${imageInfo.path}“ stimmt nicht mit den ZIP-Metadaten überein.`,
      { path: imageInfo.path },
    )
  }
  const header = await blob.slice(0, 256).arrayBuffer()
  if (isZipMagic(header)) {
    throw new ZipValidationError(
      'nested-zip',
      `Der als Bild benannte Eintrag „${imageInfo.path}“ enthält tatsächlich eine weitere ZIP-Datei.`,
      { path: imageInfo.path },
    )
  }
  const detectedFormat = detectImageFormat(header)
  if (detectedFormat === undefined) {
    throw new ZipValidationError(
      'format-mismatch',
      `„${imageInfo.path}“ besitzt keine gültige Signatur eines unterstützten Bildformats und wird übersprungen.`,
      { path: imageInfo.path },
    )
  }
  if (detectedFormat !== imageInfo.format) {
    throw new ZipValidationError(
      'format-mismatch',
      `Die Dateiendung von „${imageInfo.path}“ passt nicht zum erkannten ${formatLabel(detectedFormat)}-Inhalt.`,
      { path: imageInfo.path },
    )
  }

  return {
    ...imageInfo,
    blob: blob.type === IMAGE_MIME_TYPES[detectedFormat]
      ? blob
      : blob.slice(0, blob.size, IMAGE_MIME_TYPES[detectedFormat]),
    mime: IMAGE_MIME_TYPES[detectedFormat],
  }
}

function createReader(file: Blob, useWebWorkers: boolean | undefined): ZipReader<Blob> {
  const options: ZipReaderConstructorOptions = {
    strictness: 'strict',
    checkAmbiguity: true,
    ...(useWebWorkers === undefined ? {} : { useWebWorkers }),
  }
  return new ZipReader(new BlobReader(file), options)
}

function cloneInspection(inspection: ZipInspection): ZipInspection {
  return {
    summary: {
      ...inspection.summary,
      formats: [...inspection.summary.formats],
      warnings: [...inspection.summary.warnings],
    },
    images: inspection.images.map((image) => ({ ...image })),
    skipped: inspection.skipped.map((entry) => ({ ...entry })),
  }
}

function normalizeReaderError(error: unknown, path?: string): ZipValidationError {
  if (error instanceof ZipValidationError) return error
  if (isCancellation(error)) {
    return new ZipValidationError('cancelled', 'Das Lesen der ZIP-Datei wurde abgebrochen.', {
      ...(path === undefined ? {} : { path }),
      cause: error,
    })
  }
  const message = error instanceof Error ? error.message : String(error)
  if (/password|encrypted/i.test(message)) {
    return new ZipValidationError('encrypted-zip', 'Die ZIP-Datei ist verschlüsselt und kann nicht verarbeitet werden.', {
      ...(path === undefined ? {} : { path }),
      detail: message,
      cause: error,
    })
  }
  return new ZipValidationError('invalid-zip', 'Die Datei ist keine gültige oder lesbare ZIP-Datei.', {
    ...(path === undefined ? {} : { path }),
    detail: message,
    cause: error,
  })
}

function normalizeEntryError(error: unknown, path: string): ZipValidationError {
  if (error instanceof ZipValidationError) return error
  const detail = error instanceof Error ? error.message : String(error)
  return new ZipValidationError(
    'corrupt-entry',
    `Der Eintrag „${path}“ ist beschädigt und wird übersprungen.`,
    { path, detail, cause: error },
  )
}

function isFatalValidationError(error: unknown): boolean {
  return error instanceof ZipValidationError && error.code !== 'corrupt-entry' && error.code !== 'format-mismatch'
}

function isCancellation(error: unknown): boolean {
  return (
    (error instanceof ZipValidationError && error.code === 'cancelled') ||
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw new ZipValidationError('cancelled', 'Das Lesen der ZIP-Datei wurde abgebrochen.', { cause: signal.reason })
  }
}

async function closeReader(reader: ZipReader<Blob>): Promise<void> {
  try {
    await reader.close()
  } catch {
    // The original parse/extraction error is more useful than a secondary close error.
  }
}

function formatLabel(format: SupportedImageFormat): string {
  if (format === 'jpeg') return 'JPEG'
  if (format === 'png') return 'PNG'
  if (format === 'webp') return 'WebP'
  if (format === 'heic') return 'HEIC/HEIF'
  if (format === 'avif') return 'AVIF'
  if (format === 'gif') return 'GIF'
  if (format === 'bmp') return 'BMP'
  return 'TIFF'
}

export type { Entry }
