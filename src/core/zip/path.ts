const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:/

export class UnsafeZipPathError extends Error {
  readonly path: string

  constructor(path: string, reason: string) {
    super(`Unsicherer ZIP-Pfad „${displayPath(path)}“: ${reason}`)
    this.name = 'UnsafeZipPathError'
    this.path = path
  }
}

function displayPath(path: string): string {
  const printable = replaceControlCharacters(path, '�')
  return printable.length > 160 ? `${printable.slice(0, 157)}…` : printable
}

/**
 * Converts a ZIP entry path into a stable, relative POSIX path.
 *
 * The function deliberately rejects traversal instead of silently resolving it.
 * This makes the result suitable as an application identifier, even though the
 * application never writes archive entries to the file system.
 */
export function normalizeZipPath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) {
    throw new UnsafeZipPathError(String(input), 'der Pfad ist leer.')
  }
  if (containsControlCharacters(input)) {
    throw new UnsafeZipPathError(input, 'Steuerzeichen sind nicht erlaubt.')
  }

  const withForwardSlashes = input.replaceAll('\\', '/').normalize('NFC')
  if (withForwardSlashes.startsWith('/') || WINDOWS_DRIVE_PATH.test(withForwardSlashes)) {
    throw new UnsafeZipPathError(input, 'absolute Pfade sind nicht erlaubt.')
  }

  const normalizedSegments: string[] = []
  for (const segment of withForwardSlashes.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      throw new UnsafeZipPathError(input, '„..“-Segmente könnten Verzeichnisse verlassen.')
    }
    normalizedSegments.push(segment)
  }

  if (normalizedSegments.length === 0) {
    throw new UnsafeZipPathError(input, 'der Pfad enthält keinen Dateinamen.')
  }
  return normalizedSegments.join('/')
}

function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint < 32 || (codePoint >= 127 && codePoint <= 159)) return true
  }
  return false
}

function replaceControlCharacters(value: string, replacement: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint < 32 || (codePoint >= 127 && codePoint <= 159) ? replacement : character
    })
    .join('')
}

export function isSafeZipPath(input: string): boolean {
  try {
    normalizeZipPath(input)
    return true
  } catch {
    return false
  }
}

/** A case-insensitive key also catches collisions on normal Windows file systems. */
export function zipPathComparisonKey(path: string): string {
  return normalizeZipPath(path).toLocaleLowerCase('de-DE')
}

export function zipBaseName(path: string): string {
  const normalized = normalizeZipPath(path)
  return normalized.slice(normalized.lastIndexOf('/') + 1)
}

export function isIgnoredZipPath(path: string): boolean {
  const normalized = normalizeZipPath(path)
  const segments = normalized.split('/')
  const fileName = segments.at(-1) ?? ''
  const lowerFileName = fileName.toLocaleLowerCase('en-US')
  return (
    segments.some((segment) => segment.toLocaleLowerCase('en-US') === '__macosx') ||
    lowerFileName === '.ds_store' ||
    lowerFileName === 'thumbs.db' ||
    lowerFileName.startsWith('._') ||
    lowerFileName.startsWith('.')
  )
}
