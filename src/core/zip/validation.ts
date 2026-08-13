import { APP_LIMITS } from '../config/limits'
import type { SupportedImageFormat, ZipSummary } from '../types'
import { ZipValidationError } from './errors'
import { formatFromFileName, hasNestedZipExtension } from './magic'
import {
  isIgnoredZipPath,
  normalizeZipPath,
  UnsafeZipPathError,
  zipBaseName,
  zipPathComparisonKey,
} from './path'

export interface ZipSafetyLimits {
  maxImages: number
  maxEntries: number
  maxSingleImageBytes: number
  maxTotalUncompressedBytes: number
  maxCompressionRatio: number
}

export const DEFAULT_ZIP_SAFETY_LIMITS: Readonly<ZipSafetyLimits> = Object.freeze({
  maxImages: APP_LIMITS.maxImages,
  maxEntries: APP_LIMITS.maxEntries,
  maxSingleImageBytes: APP_LIMITS.maxSingleImageBytes,
  maxTotalUncompressedBytes: APP_LIMITS.maxTotalUncompressedBytes,
  maxCompressionRatio: APP_LIMITS.maxCompressionRatio,
})

export interface ZipEntryMetadataLike {
  filename: string
  directory: boolean
  compressedSize: number
  uncompressedSize: number
  encrypted?: boolean
  lastModDate?: Date
}

export interface SafeZipImageEntry {
  index: number
  originalPath: string
  path: string
  name: string
  format: SupportedImageFormat
  compressedSize: number
  uncompressedSize: number
  lastModified: Date | undefined
}

export type SkippedZipEntryReason = 'directory' | 'empty' | 'system' | 'unsupported'

export interface SkippedZipEntry {
  index: number
  path: string
  reason: SkippedZipEntryReason
}

export interface ZipInspection {
  summary: ZipSummary
  images: SafeZipImageEntry[]
  skipped: SkippedZipEntry[]
}

export function validateZipEntries(
  entries: readonly ZipEntryMetadataLike[],
  limitOverrides: Partial<ZipSafetyLimits> = {},
): ZipInspection {
  const limits = resolveZipSafetyLimits(limitOverrides)
  if (entries.length > limits.maxEntries) {
    throw new ZipValidationError(
      'too-many-entries',
      `Die ZIP-Datei enthält ${formatInteger(entries.length)} Einträge. Erlaubt sind höchstens ${formatInteger(limits.maxEntries)}.`,
    )
  }

  const pathKeys = new Map<string, string>()
  const images: SafeZipImageEntry[] = []
  const skipped: SkippedZipEntry[] = []
  const formats = new Set<SupportedImageFormat>()
  let totalUncompressedBytes = 0
  let totalFiles = 0

  for (const [index, entry] of entries.entries()) {
    validateEntrySizes(entry)

    let path: string
    try {
      path = normalizeZipPath(entry.filename)
    } catch (error) {
      if (error instanceof UnsafeZipPathError) {
        throw new ZipValidationError('unsafe-path', error.message, { path: entry.filename, cause: error })
      }
      throw error
    }

    const comparisonKey = zipPathComparisonKey(path)
    const existingPath = pathKeys.get(comparisonKey)
    if (existingPath !== undefined) {
      throw new ZipValidationError(
        'duplicate-path',
        `Der ZIP-Pfad „${path}“ ist doppelt vorhanden (bereits als „${existingPath}“).`,
        { path },
      )
    }
    pathKeys.set(comparisonKey, path)

    if (entry.directory) {
      skipped.push({ index, path, reason: 'directory' })
      continue
    }

    totalFiles += 1
    totalUncompressedBytes += entry.uncompressedSize
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      throw new ZipValidationError(
        'archive-too-large',
        `Die entpackte Gesamtgröße überschreitet das Sicherheitslimit von ${formatBytes(limits.maxTotalUncompressedBytes)}.`,
        { path },
      )
    }

    if (entry.encrypted === true) {
      throw new ZipValidationError(
        'encrypted-zip',
        `Der Eintrag „${path}“ ist verschlüsselt. Verschlüsselte ZIP-Dateien werden nicht unterstützt.`,
        { path },
      )
    }

    const ratio = compressionRatio(entry.compressedSize, entry.uncompressedSize)
    if (ratio > limits.maxCompressionRatio) {
      throw new ZipValidationError(
        'compression-ratio',
        `Der Eintrag „${path}“ hat ein ungewöhnlich hohes Kompressionsverhältnis (${formatRatio(ratio)}). Das Sicherheitslimit liegt bei ${formatRatio(limits.maxCompressionRatio)}.`,
        { path },
      )
    }

    if (hasNestedZipExtension(path)) {
      throw new ZipValidationError(
        'nested-zip',
        `Der Eintrag „${path}“ ist ein verschachteltes Archiv. ZIP-Dateien innerhalb der ausgewählten ZIP-Datei werden aus Sicherheitsgründen nicht verarbeitet.`,
        { path },
      )
    }

    if (entry.uncompressedSize === 0) {
      skipped.push({ index, path, reason: 'empty' })
      continue
    }
    if (isIgnoredZipPath(path)) {
      skipped.push({ index, path, reason: 'system' })
      continue
    }

    const format = formatFromFileName(path)
    if (format === undefined) {
      skipped.push({ index, path, reason: 'unsupported' })
      continue
    }
    if (entry.uncompressedSize > limits.maxSingleImageBytes) {
      throw new ZipValidationError(
        'entry-too-large',
        `Das Bild „${path}“ ist mit ${formatBytes(entry.uncompressedSize)} größer als das Sicherheitslimit von ${formatBytes(limits.maxSingleImageBytes)}.`,
        { path },
      )
    }

    images.push({
      index,
      originalPath: entry.filename,
      path,
      name: zipBaseName(path),
      format,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
      lastModified: entry.lastModDate,
    })
    formats.add(format)
    if (images.length > limits.maxImages) {
      throw new ZipValidationError(
        'too-many-images',
        `Die ZIP-Datei enthält mehr als ${formatInteger(limits.maxImages)} unterstützte Bilder. Das ist das technische Sicherheitslimit; bitte teilen Sie den Bestand möglichst in ZIP-Dateien mit höchstens ${formatInteger(APP_LIMITS.recommendedImagesPerArchive)} Bildern auf.`,
        { path },
      )
    }
  }

  const warnings: string[] = []
  const unsupportedCount = skipped.filter((entry) => entry.reason === 'unsupported').length
  const systemCount = skipped.filter((entry) => entry.reason === 'system').length
  const emptyCount = skipped.filter((entry) => entry.reason === 'empty').length
  if (unsupportedCount > 0) warnings.push(`${formatInteger(unsupportedCount)} nicht unterstützte Datei(en) werden übersprungen.`)
  if (systemCount > 0) warnings.push(`${formatInteger(systemCount)} System- oder Metadatendatei(en) werden ignoriert.`)
  if (emptyCount > 0) warnings.push(`${formatInteger(emptyCount)} leere Datei(en) werden ignoriert.`)

  return {
    summary: {
      totalEntries: totalFiles,
      supportedImages: images.length,
      skippedEntries: skipped.filter((entry) => entry.reason !== 'directory').length,
      corruptedImages: 0,
      totalUncompressedBytes,
      formats: [...formats],
      warnings,
    },
    images,
    skipped,
  }
}

export function resolveZipSafetyLimits(overrides: Partial<ZipSafetyLimits> = {}): ZipSafetyLimits {
  const limits: ZipSafetyLimits = { ...DEFAULT_ZIP_SAFETY_LIMITS, ...overrides }
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new TypeError(`ZIP-Grenzwert „${name}“ muss eine positive endliche Zahl sein.`)
    }
  }
  return limits
}

export function compressionRatio(compressedSize: number, uncompressedSize: number): number {
  if (uncompressedSize === 0) return 0
  if (compressedSize === 0) return Number.POSITIVE_INFINITY
  return uncompressedSize / compressedSize
}

function validateEntrySizes(entry: ZipEntryMetadataLike): void {
  if (
    !Number.isSafeInteger(entry.compressedSize) || entry.compressedSize < 0 ||
    !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0
  ) {
    throw new ZipValidationError(
      'invalid-zip',
      `Der ZIP-Eintrag „${entry.filename}“ enthält ungültige Größenangaben.`,
      { path: entry.filename },
    )
  }
}

function formatBytes(bytes: number): string {
  const units = ['Byte', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: unitIndex === 0 ? 0 : 1 }).format(value)} ${units[unitIndex]}`
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)
}

function formatRatio(value: number): string {
  if (!Number.isFinite(value)) return 'unendlich'
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(value)}:1`
}
