import { APP_LIMITS } from '../config/limits'

export interface FingerprintableBlob extends Blob {
  readonly name?: string
  readonly lastModified?: number
}

export interface ZipFingerprintMetadata {
  name: string
  size: number
  lastModified: number
  chunkBytes: number
}

/**
 * Computes a SHA-256 identity from stable file metadata and bounded byte ranges.
 * Only at most two small chunks are read, so even multi-gigabyte archives do not
 * have to be loaded or hashed in full.
 */
export async function createZipFingerprint(
  file: FingerprintableBlob,
  chunkBytes = APP_LIMITS.zipFingerprintChunkBytes,
): Promise<string> {
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
    throw new TypeError('Die Fingerabdruck-Blockgröße muss eine positive ganze Zahl sein.')
  }
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) {
    throw new Error('SHA-256 ist in diesem Browser nicht verfügbar.')
  }

  const metadata: ZipFingerprintMetadata = {
    name: file.name ?? '',
    size: file.size,
    lastModified: file.lastModified ?? 0,
    chunkBytes,
  }
  const metadataBytes = new TextEncoder().encode(`lokale-bildpruefung:zip:v1\n${JSON.stringify(metadata)}\n`)
  const leadingLength = Math.min(file.size, chunkBytes)
  const trailingStart = Math.max(leadingLength, file.size - chunkBytes)
  const leadingBytes = new Uint8Array(await file.slice(0, leadingLength).arrayBuffer())
  const trailingBytes = new Uint8Array(await file.slice(trailingStart).arrayBuffer())

  const payload = new Uint8Array(metadataBytes.byteLength + leadingBytes.byteLength + trailingBytes.byteLength)
  payload.set(metadataBytes, 0)
  payload.set(leadingBytes, metadataBytes.byteLength)
  payload.set(trailingBytes, metadataBytes.byteLength + leadingBytes.byteLength)

  const digest = new Uint8Array(await subtle.digest('SHA-256', payload))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const fingerprintZipFile = createZipFingerprint
