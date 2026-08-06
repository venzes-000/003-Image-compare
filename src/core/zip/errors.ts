import type { AppError } from '../types'

export type ZipValidationErrorCode =
  | 'invalid-zip'
  | 'encrypted-zip'
  | 'unsafe-path'
  | 'duplicate-path'
  | 'nested-zip'
  | 'too-many-entries'
  | 'too-many-images'
  | 'entry-too-large'
  | 'archive-too-large'
  | 'compression-ratio'
  | 'corrupt-entry'
  | 'format-mismatch'
  | 'cancelled'

export class ZipValidationError extends Error {
  readonly code: ZipValidationErrorCode
  readonly path: string | undefined
  readonly detail: string | undefined

  constructor(code: ZipValidationErrorCode, message: string, options: { path?: string; detail?: string; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ZipValidationError'
    this.code = code
    this.path = options.path
    this.detail = options.detail
  }
}

export function zipErrorToAppError(error: unknown, fallbackPath?: string): AppError {
  const zipError = error instanceof ZipValidationError ? error : undefined
  const path = zipError?.path ?? fallbackPath
  const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Lesen der ZIP-Datei.'
  const code: AppError['code'] = mapCode(zipError?.code)
  const detail = zipError?.detail ?? (error instanceof Error ? error.name : undefined)
  const result: AppError = {
    id: createErrorId(code, path, message),
    code,
    message,
    recoverable: code === 'corrupt-entry' || code === 'corrupt-image' || code === 'unsupported-image',
  }
  if (detail !== undefined) result.detail = detail
  if (path !== undefined) result.path = path
  return result
}

function mapCode(code: ZipValidationErrorCode | undefined): AppError['code'] {
  if (code === 'encrypted-zip') return 'encrypted-zip'
  if (code === 'corrupt-entry') return 'corrupt-entry'
  if (code === 'format-mismatch') return 'corrupt-image'
  if (code === 'cancelled') return 'cancelled'
  if (
    code === 'too-many-entries' ||
    code === 'too-many-images' ||
    code === 'entry-too-large' ||
    code === 'archive-too-large' ||
    code === 'compression-ratio'
  ) return 'limit-exceeded'
  return 'invalid-zip'
}

function createErrorId(code: string, path: string | undefined, message: string): string {
  let hash = 2166136261
  const input = `${code}\0${path ?? ''}\0${message}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `zip-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
