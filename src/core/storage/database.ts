import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { APP_LIMITS } from '../config/limits'
import type { AnalysisResult, AnalysisSettings, Decision } from '../types'
import { detectImageFormat } from '../zip/magic'

export const STORAGE_DATABASE_NAME = 'lokale-bildpruefung'
export const STORAGE_SCHEMA_VERSION = APP_LIMITS.databaseVersion
export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024

const CACHE_ENABLED_SETTING = 'cache-enabled'
const ANALYSIS_SETTINGS_KEY = 'analysis-settings'

export interface StoredAnalysis {
  fingerprint: string
  schemaVersion: number
  appVersion: string
  updatedAt: string
  result: AnalysisResult
}

export interface StoredAnalysisSummary {
  fingerprint: string
  appVersion: string
  updatedAt: string
  zipName: string
  zipSize: number
  analyzedAt: string
  imageCount: number
}

export interface StoredThumbnail {
  id: string
  fingerprint: string
  thumbnailKey: string
  blob: Blob
  updatedAt: string
}

export interface StoredDecision {
  id: string
  fingerprint: string
  imageId: string
  decision: Decision
  updatedAt: string
}

export interface StoredCacheValue<T = unknown> {
  id: string
  fingerprint: string
  key: string
  value: T
  updatedAt: string
}

interface StoredSetting {
  key: string
  value: unknown
  updatedAt: string
}

interface AppDatabaseSchema extends DBSchema {
  analyses: {
    key: string
    value: StoredAnalysis
    indexes: { 'by-updated-at': string }
  }
  thumbnails: {
    key: string
    value: StoredThumbnail
    indexes: { 'by-fingerprint': string }
  }
  decisions: {
    key: string
    value: StoredDecision
    indexes: { 'by-fingerprint': string }
  }
  cache: {
    key: string
    value: StoredCacheValue
    indexes: { 'by-fingerprint': string }
  }
  settings: {
    key: string
    value: StoredSetting
  }
}

export class AnalysisStorageError extends Error {
  readonly code: 'unavailable' | 'quota' | 'invalid-data' | 'database'

  constructor(
    code: AnalysisStorageError['code'],
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'AnalysisStorageError'
    this.code = code
  }
}

export class AnalysisStorage {
  #databasePromise: Promise<IDBPDatabase<AppDatabaseSchema>> | undefined

  async isAvailable(): Promise<boolean> {
    if (!isIndexedDbAvailable()) return false
    try {
      await this.#database()
      return true
    } catch {
      return false
    }
  }

  async saveAnalysis(fingerprint: string, result: AnalysisResult): Promise<void> {
    const safeFingerprint = validateKeyPart(fingerprint, 'ZIP-Fingerabdruck')
    const record: StoredAnalysis = {
      fingerprint: safeFingerprint,
      schemaVersion: STORAGE_SCHEMA_VERSION,
      appVersion: result.version,
      updatedAt: new Date().toISOString(),
      result,
    }
    await this.#operation((database) => database.put('analyses', record))
  }

  /** Saves only when the user enabled persistent caching. */
  async saveAnalysisIfCacheEnabled(fingerprint: string, result: AnalysisResult): Promise<boolean> {
    if (!(await this.isCacheEnabled())) return false
    await this.saveAnalysis(fingerprint, result)
    return true
  }

  async loadAnalysis(fingerprint: string): Promise<AnalysisResult | undefined> {
    const safeFingerprint = validateKeyPart(fingerprint, 'ZIP-Fingerabdruck')
    const record = await this.#operation((database) => database.get('analyses', safeFingerprint))
    if (record === undefined || record.schemaVersion !== STORAGE_SCHEMA_VERSION) return undefined
    return record.result
  }

  async hasAnalysis(fingerprint: string): Promise<boolean> {
    const safeFingerprint = validateKeyPart(fingerprint, 'ZIP-Fingerabdruck')
    const key = await this.#operation((database) => database.getKey('analyses', safeFingerprint))
    return key !== undefined
  }

  async listAnalyses(): Promise<StoredAnalysisSummary[]> {
    const records = await this.#operation((database) => database.getAllFromIndex('analyses', 'by-updated-at'))
    return records
      .filter((record) => record.schemaVersion === STORAGE_SCHEMA_VERSION)
      .map((record) => ({
        fingerprint: record.fingerprint,
        appVersion: record.appVersion,
        updatedAt: record.updatedAt,
        zipName: record.result.zipName,
        zipSize: record.result.zipSize,
        analyzedAt: record.result.analyzedAt,
        imageCount: record.result.images.length,
      }))
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
  }

  async saveThumbnail(fingerprint: string, thumbnailKey: string, blob: Blob): Promise<void> {
    const safeFingerprint = validateKeyPart(fingerprint, 'ZIP-Fingerabdruck')
    const safeThumbnailKey = validateKeyPart(thumbnailKey, 'Vorschauschlüssel')
    await validateThumbnail(blob)
    const record: StoredThumbnail = {
      id: compoundId(safeFingerprint, safeThumbnailKey),
      fingerprint: safeFingerprint,
      thumbnailKey: safeThumbnailKey,
      blob,
      updatedAt: new Date().toISOString(),
    }
    await this.#operation((database) => database.put('thumbnails', record))
  }

  async loadThumbnail(fingerprint: string, thumbnailKey: string): Promise<Blob | undefined> {
    const id = compoundId(
      validateKeyPart(fingerprint, 'ZIP-Fingerabdruck'),
      validateKeyPart(thumbnailKey, 'Vorschauschlüssel'),
    )
    return (await this.#operation((database) => database.get('thumbnails', id)))?.blob
  }

  async saveDecision(fingerprint: string, imageId: string, decision: Decision): Promise<void> {
    const safeFingerprint = validateKeyPart(fingerprint, 'ZIP-Fingerabdruck')
    const safeImageId = validateKeyPart(imageId, 'Bild-ID')
    assertDecision(decision)
    const record: StoredDecision = {
      id: compoundId(safeFingerprint, safeImageId),
      fingerprint: safeFingerprint,
      imageId: safeImageId,
      decision,
      updatedAt: new Date().toISOString(),
    }
    await this.#operation((database) => database.put('decisions', record))
  }

  async saveDecisions(fingerprint: string, decisions: ReadonlyMap<string, Decision> | Record<string, Decision>): Promise<void> {
    const safeFingerprint = validateKeyPart(fingerprint, 'ZIP-Fingerabdruck')
    const entries = decisions instanceof Map ? [...decisions.entries()] : Object.entries(decisions)
    const database = await this.#database()
    try {
      const transaction = database.transaction('decisions', 'readwrite')
      for (const [imageId, decision] of entries) {
        const safeImageId = validateKeyPart(imageId, 'Bild-ID')
        assertDecision(decision)
        await transaction.store.put({
          id: compoundId(safeFingerprint, safeImageId),
          fingerprint: safeFingerprint,
          imageId: safeImageId,
          decision,
          updatedAt: new Date().toISOString(),
        })
      }
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async loadDecisions(fingerprint: string): Promise<Map<string, Decision>> {
    const safeFingerprint = validateKeyPart(fingerprint, 'ZIP-Fingerabdruck')
    const records = await this.#operation((database) =>
      database.getAllFromIndex('decisions', 'by-fingerprint', safeFingerprint),
    )
    return new Map(records.map((record) => [record.imageId, record.decision]))
  }

  async saveSettings(settings: AnalysisSettings): Promise<void> {
    await this.#saveSetting(ANALYSIS_SETTINGS_KEY, settings)
  }

  async loadSettings(): Promise<AnalysisSettings | undefined> {
    const value = await this.#loadSetting(ANALYSIS_SETTINGS_KEY)
    return isAnalysisSettings(value) ? value : undefined
  }

  async setCacheEnabled(enabled: boolean): Promise<void> {
    await this.#saveSetting(CACHE_ENABLED_SETTING, enabled)
  }

  async isCacheEnabled(): Promise<boolean> {
    return (await this.#loadSetting(CACHE_ENABLED_SETTING)) === true
  }

  async saveCacheValue<T>(fingerprint: string, key: string, value: T): Promise<boolean> {
    if (!(await this.isCacheEnabled())) return false
    if (containsBlob(value)) {
      throw new AnalysisStorageError(
        'invalid-data',
        'Original- oder sonstige Bild-Blobs dürfen nicht im Merkmalscache gespeichert werden. Nutzen Sie für kleine Vorschaubilder saveThumbnail().',
      )
    }
    const safeFingerprint = validateKeyPart(fingerprint, 'ZIP-Fingerabdruck')
    const safeKey = validateKeyPart(key, 'Cache-Schlüssel')
    const record: StoredCacheValue<T> = {
      id: compoundId(safeFingerprint, safeKey),
      fingerprint: safeFingerprint,
      key: safeKey,
      value,
      updatedAt: new Date().toISOString(),
    }
    await this.#operation((database) => database.put('cache', record))
    return true
  }

  async loadCacheValue<T>(fingerprint: string, key: string): Promise<T | undefined> {
    const id = compoundId(
      validateKeyPart(fingerprint, 'ZIP-Fingerabdruck'),
      validateKeyPart(key, 'Cache-Schlüssel'),
    )
    const record = await this.#operation((database) => database.get('cache', id))
    return record?.value as T | undefined
  }

  async deleteAnalysis(fingerprint: string): Promise<void> {
    const safeFingerprint = validateKeyPart(fingerprint, 'ZIP-Fingerabdruck')
    const database = await this.#database()
    try {
      const transaction = database.transaction(['analyses', 'thumbnails', 'decisions', 'cache'], 'readwrite')
      await transaction.objectStore('analyses').delete(safeFingerprint)
      const thumbnailStore = transaction.objectStore('thumbnails')
      const decisionStore = transaction.objectStore('decisions')
      const cacheStore = transaction.objectStore('cache')
      const [thumbnailKeys, decisionKeys, cacheKeys] = await Promise.all([
        thumbnailStore.index('by-fingerprint').getAllKeys(safeFingerprint),
        decisionStore.index('by-fingerprint').getAllKeys(safeFingerprint),
        cacheStore.index('by-fingerprint').getAllKeys(safeFingerprint),
      ])
      await Promise.all([
        ...thumbnailKeys.map((key) => thumbnailStore.delete(key)),
        ...decisionKeys.map((key) => decisionStore.delete(key)),
        ...cacheKeys.map((key) => cacheStore.delete(key)),
      ])
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async clearAnalysisData(): Promise<void> {
    const database = await this.#database()
    try {
      const transaction = database.transaction(['analyses', 'thumbnails', 'decisions', 'cache'], 'readwrite')
      await Promise.all([
        transaction.objectStore('analyses').clear(),
        transaction.objectStore('thumbnails').clear(),
        transaction.objectStore('decisions').clear(),
        transaction.objectStore('cache').clear(),
      ])
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async clearAll(): Promise<void> {
    const database = await this.#database()
    try {
      const transaction = database.transaction(['analyses', 'thumbnails', 'decisions', 'cache', 'settings'], 'readwrite')
      await Promise.all([
        transaction.objectStore('analyses').clear(),
        transaction.objectStore('thumbnails').clear(),
        transaction.objectStore('decisions').clear(),
        transaction.objectStore('cache').clear(),
        transaction.objectStore('settings').clear(),
      ])
      await transaction.done
    } catch (error) {
      throw toStorageError(error)
    }
  }

  close(): void {
    if (this.#databasePromise === undefined) return
    void this.#databasePromise.then((database) => database.close()).catch(() => undefined)
    this.#databasePromise = undefined
  }

  async deleteDatabase(): Promise<void> {
    if (this.#databasePromise !== undefined) {
      try {
        const database = await this.#databasePromise
        database.close()
      } catch {
        // A failed connection does not prevent a delete attempt.
      }
      this.#databasePromise = undefined
    }
    try {
      await deleteDB(STORAGE_DATABASE_NAME)
    } catch (error) {
      throw toStorageError(error)
    }
  }

  async #database(): Promise<IDBPDatabase<AppDatabaseSchema>> {
    if (!isIndexedDbAvailable()) {
      throw new AnalysisStorageError(
        'unavailable',
        'IndexedDB ist in diesem Browser nicht verfügbar. Die Analyse kann fortgesetzt, aber nicht lokal zwischengespeichert werden.',
      )
    }
    this.#databasePromise ??= openApplicationDatabase()
    try {
      return await this.#databasePromise
    } catch (error) {
      this.#databasePromise = undefined
      throw toStorageError(error)
    }
  }

  async #operation<T>(operation: (database: IDBPDatabase<AppDatabaseSchema>) => Promise<T>): Promise<T> {
    try {
      return await operation(await this.#database())
    } catch (error) {
      if (error instanceof AnalysisStorageError) throw error
      throw toStorageError(error)
    }
  }

  async #saveSetting(key: string, value: unknown): Promise<void> {
    await this.#operation((database) => database.put('settings', {
      key,
      value,
      updatedAt: new Date().toISOString(),
    }))
  }

  async #loadSetting(key: string): Promise<unknown> {
    return (await this.#operation((database) => database.get('settings', key)))?.value
  }
}

export const analysisStorage = new AnalysisStorage()
export const storageService = analysisStorage

export function isIndexedDbAvailable(): boolean {
  return typeof globalThis.indexedDB !== 'undefined'
}

export async function estimateLocalStorage(): Promise<StorageEstimate | undefined> {
  try {
    return await globalThis.navigator?.storage?.estimate()
  } catch {
    return undefined
  }
}

async function openApplicationDatabase(): Promise<IDBPDatabase<AppDatabaseSchema>> {
  return openDB<AppDatabaseSchema>(STORAGE_DATABASE_NAME, STORAGE_SCHEMA_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('analyses')) {
        const store = database.createObjectStore('analyses', { keyPath: 'fingerprint' })
        store.createIndex('by-updated-at', 'updatedAt')
      }
      if (!database.objectStoreNames.contains('thumbnails')) {
        const store = database.createObjectStore('thumbnails', { keyPath: 'id' })
        store.createIndex('by-fingerprint', 'fingerprint')
      }
      if (!database.objectStoreNames.contains('decisions')) {
        const store = database.createObjectStore('decisions', { keyPath: 'id' })
        store.createIndex('by-fingerprint', 'fingerprint')
      }
      if (!database.objectStoreNames.contains('cache')) {
        const store = database.createObjectStore('cache', { keyPath: 'id' })
        store.createIndex('by-fingerprint', 'fingerprint')
      }
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'key' })
      }
    },
  })
}

async function validateThumbnail(blob: Blob): Promise<void> {
  if (blob.size <= 0 || blob.size > MAX_THUMBNAIL_BYTES) {
    throw new AnalysisStorageError(
      'invalid-data',
      `Vorschaubilder müssen zwischen 1 Byte und ${MAX_THUMBNAIL_BYTES / 1024 / 1024} MiB groß sein. Originalbilder werden nicht dauerhaft gespeichert.`,
    )
  }
  const header = await blob.slice(0, 16).arrayBuffer()
  if (detectImageFormat(header) === undefined) {
    throw new AnalysisStorageError('invalid-data', 'Das Vorschaubild besitzt kein unterstütztes Bildformat.')
  }
}

function validateKeyPart(value: string, label: string): string {
  const normalized = value.normalize('NFC').trim()
  if (normalized.length === 0 || normalized.length > 512 || normalized.includes('\u0000')) {
    throw new AnalysisStorageError('invalid-data', `${label} ist leer oder ungültig.`)
  }
  return normalized
}

function compoundId(fingerprint: string, key: string): string {
  return `${fingerprint}\u0000${key}`
}

function assertDecision(value: string): asserts value is Decision {
  if (value !== 'unreviewed' && value !== 'duplicate' && value !== 'different' && value !== 'later') {
    throw new AnalysisStorageError('invalid-data', `Unbekannte Nutzerentscheidung „${value}“.`)
  }
}

function isAnalysisSettings(value: unknown): value is AnalysisSettings {
  if (typeof value !== 'object' || value === null) return false
  const settings = value as Partial<Record<keyof AnalysisSettings, unknown>>
  return (
    (settings.mode === 'strict' || settings.mode === 'balanced' || settings.mode === 'sensitive') &&
    isFiniteNumber(settings.workerCount) && settings.workerCount >= 1 && settings.workerCount <= 4 &&
    isFiniteNumber(settings.pHashThreshold) &&
    isFiniteNumber(settings.dHashThreshold) &&
    isFiniteNumber(settings.aHashThreshold) &&
    isFiniteNumber(settings.minimumSsim) &&
    isFiniteNumber(settings.minimumHistogramSimilarity) &&
    isFiniteNumber(settings.candidateLimitPerImage)
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function containsBlob(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  if (typeof value !== 'object' || value === null) return false
  if (value instanceof Date || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.some((item) => containsBlob(item, seen))
  if (value instanceof Map) {
    for (const [key, item] of value) {
      if (containsBlob(key, seen) || containsBlob(item, seen)) return true
    }
    return false
  }
  if (value instanceof Set) {
    for (const item of value) {
      if (containsBlob(item, seen)) return true
    }
    return false
  }
  for (const item of Object.values(value)) {
    if (containsBlob(item, seen)) return true
  }
  return false
}

function toStorageError(error: unknown): AnalysisStorageError {
  if (error instanceof AnalysisStorageError) return error
  if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
    return new AnalysisStorageError(
      'quota',
      'Der lokale Browserspeicher ist voll. Löschen Sie alte Analysedaten oder deaktivieren Sie den Cache.',
      error,
    )
  }
  return new AnalysisStorageError(
    'database',
    'Lokale Analysedaten konnten nicht gelesen oder gespeichert werden.',
    error,
  )
}
