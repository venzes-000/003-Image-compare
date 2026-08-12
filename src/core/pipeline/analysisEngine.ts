import { createDuplicateGroups } from '../clustering'
import { zipArchiveService, createZipFingerprint, type ZipImageData } from '../zip'
import type {
  AnalysisProgress,
  AnalysisResult,
  AnalysisSettings,
  AppError,
  ImageFeatureRecord,
  ZipSummary,
} from '../types'
import { thumbnailStore } from '../../app/thumbnailStore'
import { CandidateWorkerClient } from './candidateWorkerClient'
import { ImageWorkerPool, ImageWorkerPoolUnavailableError } from './imageWorkerPool'

export interface AnalysisCacheAdapter {
  saveThumbnail(fingerprint: string, key: string, blob: Blob): Promise<void>
  saveAnalysis(result: AnalysisResult): Promise<void>
}

export interface AnalysisEngineCallbacks {
  onProgress: (progress: AnalysisProgress) => void
  onError: (error: AppError) => void
}

const INITIAL_PROGRESS: AnalysisProgress = {
  phase: 'idle',
  percent: 0,
  processed: 0,
  total: 0,
  candidates: 0,
  message: 'Bereit',
}

const PROGRESS_THROTTLE_MS = 100
const SLOW_ANALYSIS_BASE_MS = 90_000
const SLOW_ANALYSIS_PER_IMAGE_MS = 1_000
const MAX_CONCURRENT_THUMBNAIL_WRITES = 8

export class AnalysisEngine {
  private readonly callbacks: AnalysisEngineCallbacks
  private readonly cache?: AnalysisCacheAdapter
  private readonly abortController = new AbortController()
  private imagePool?: ImageWorkerPool
  private candidateClient?: CandidateWorkerClient
  private paused = false
  private cancelled = false
  private cacheWritable = true
  private resumeWaiters: Array<() => void> = []
  private progress: AnalysisProgress = INITIAL_PROGRESS
  private phaseBeforePause: AnalysisProgress['phase'] = 'idle'
  private lastProgressNotificationAt = 0
  private phaseStartedAt = 0
  private pausedAt?: number
  private phaseTimings: Partial<Record<AnalysisProgress['phase'], number>> = {}
  private imageTimings: NonNullable<AnalysisProgress['imageTimings']> = {
    images: 0,
    metadataMs: 0,
    decodeMs: 0,
    analysisMs: 0,
    thumbnailMs: 0,
    totalMs: 0,
  }
  private thumbnailWrites = new Set<Promise<void>>()
  private cacheErrorReported = false

  constructor(callbacks: AnalysisEngineCallbacks, cache?: AnalysisCacheAdapter) {
    this.callbacks = callbacks
    this.cache = cache
  }

  async run(file: File, settings: AnalysisSettings): Promise<AnalysisResult> {
    const startedAt = Date.now()
    this.progress = INITIAL_PROGRESS
    this.lastProgressNotificationAt = 0
    this.phaseStartedAt = startedAt
    this.pausedAt = undefined
    this.phaseTimings = {}
    this.imageTimings = { images: 0, metadataMs: 0, decodeMs: 0, analysisMs: 0, thumbnailMs: 0, totalMs: 0 }
    this.thumbnailWrites.clear()
    this.cacheWritable = true
    this.cacheErrorReported = false
    const errors: AppError[] = []
    this.updateProgress({ phase: 'validating-zip', percent: 1, message: 'ZIP-Datei wird geprüft', startedAt })
    const zipFingerprint = await createZipFingerprint(file)
    const inspection = await zipArchiveService.inspect(file, { signal: this.abortController.signal })
    this.assertNotCancelled()

    this.updateProgress({
      phase: 'collecting-files',
      percent: 6,
      processed: 0,
      total: inspection.images.length,
      message: `${inspection.images.length.toLocaleString('de-DE')} Bilddateien gefunden`,
      startedAt,
    })

    const images: ImageFeatureRecord[] = []
    const pending = new Set<Promise<void>>()
    let scheduled = 0
    let analyzed = 0
    let extracted = 0
    let decodeErrorCount = 0
    this.imagePool = new ImageWorkerPool(settings.workerCount, {
      onRuntimeFallback: (reason) => this.updateProgress({
        warning: `Ein Bild-Worker ist ausgefallen: ${reason}`,
      }),
    })
    const execution: NonNullable<AnalysisProgress['execution']> = {
      mode: this.imagePool.mode,
      workerCount: this.imagePool.capacity,
      ...(this.imagePool.fallbackReason ? { fallbackReason: this.imagePool.fallbackReason } : {}),
    }
    this.updateProgress({
      execution,
      warning: execution.mode === 'main-thread'
        ? `Langsamer KompatibilitÃ¤tsmodus: ${execution.fallbackReason ?? 'Bild-Worker nicht verfÃ¼gbar'}.`
        : undefined,
    })

    const processImage = async (image: ZipImageData, index: number): Promise<void> => {
      try {
        await this.waitUntilResumed()
        this.assertNotCancelled()
        const buffer = await image.blob.arrayBuffer()
        const id = `image-${String(index + 1).padStart(5, '0')}`
        const analyzedImage = await this.imagePool?.analyze({
          taskId: id,
          image: {
            id,
            path: image.path,
            name: image.name,
            size: image.uncompressedSize,
            compressedSize: image.compressedSize,
            mime: image.mime,
            format: image.format,
            ...(image.lastModified ? { archiveModifiedAt: image.lastModified.toISOString() } : {}),
          },
          buffer,
        })
        if (!analyzedImage) throw new Error('Die Bildanalyse wurde unerwartet beendet.')
        this.imageTimings.images += 1
        this.imageTimings.metadataMs += analyzedImage.timings.metadataMs
        this.imageTimings.decodeMs += analyzedImage.timings.decodeMs
        this.imageTimings.analysisMs += analyzedImage.timings.analysisMs
        this.imageTimings.thumbnailMs += analyzedImage.timings.thumbnailMs
        this.imageTimings.totalMs += analyzedImage.timings.totalMs
        images.push(analyzedImage.feature)
        const thumbnail = new Blob([analyzedImage.thumbnail], { type: analyzedImage.thumbnailMime })
        thumbnailStore.set(analyzedImage.feature.thumbnailKey, thumbnail)
        if (this.cache && this.cacheWritable) {
          if (this.thumbnailWrites.size >= MAX_CONCURRENT_THUMBNAIL_WRITES) {
            await this.raceWithAbort(Promise.race(this.thumbnailWrites))
          }
          this.assertNotCancelled()
          const write = this.cache.saveThumbnail(zipFingerprint, analyzedImage.feature.thumbnailKey, thumbnail)
            .catch((cacheError) => this.handleThumbnailCacheError(cacheError, errors))
          this.thumbnailWrites.add(write)
          void write.finally(() => this.thumbnailWrites.delete(write))
        }
      } catch (error) {
        if (this.isAbort(error)) throw error
        if (error instanceof ImageWorkerPoolUnavailableError) throw error
        decodeErrorCount += 1
        const appError: AppError = {
          id: crypto.randomUUID(),
          code: 'corrupt-image',
          message: `„${image.path}“ konnte nicht als Bild verarbeitet werden.`,
          detail: error instanceof Error ? error.message : String(error),
          path: image.path,
          phase: 'creating-previews',
          recoverable: true,
        }
        errors.push(appError)
        this.callbacks.onError(appError)
      } finally {
        analyzed += 1
        const ratio = analyzed / Math.max(1, inspection.images.length)
        this.updateProgress({
          phase: ratio < 0.45 ? 'creating-previews' : 'calculating-fingerprints',
          percent: 10 + ratio * 50,
          processed: analyzed,
          total: inspection.images.length,
          message: ratio < 0.45
            ? `${extracted.toLocaleString('de-DE')} entpackt · ${analyzed.toLocaleString('de-DE')} analysiert`
            : `Visuelle Fingerabdrücke: ${analyzed.toLocaleString('de-DE')} von ${inspection.images.length.toLocaleString('de-DE')}`,
          startedAt,
        }, true)
      }
    }

    const readResult = await (async () => {
      try {
        const result = await zipArchiveService.readImages(
          file,
          async (image) => {
            await this.waitUntilResumed()
            this.assertNotCancelled()
            extracted += 1
            const currentIndex = scheduled
            scheduled += 1
            const task = processImage(image, currentIndex)
            pending.add(task)
            task.then(() => pending.delete(task), () => pending.delete(task))
            if (pending.size >= (this.imagePool?.capacity ?? 1)) await Promise.race(pending)
          },
          { signal: this.abortController.signal },
        )
        await Promise.all(pending)
        return result
      } finally {
        this.imagePool?.dispose()
        this.imagePool = undefined
      }
    })()
    errors.push(...readResult.errors)
    for (const error of readResult.errors) this.callbacks.onError(error)
    this.assertNotCancelled()

    if (this.thumbnailWrites.size > 0) await this.raceWithAbort(Promise.all(this.thumbnailWrites))
    await this.waitUntilResumed()
    this.assertNotCancelled()

    images.sort((left, right) => left.path.localeCompare(right.path, 'de', { sensitivity: 'base' }))
    const summary: ZipSummary = {
      ...readResult.inspection.summary,
      corruptedImages: readResult.inspection.summary.corruptedImages + decodeErrorCount,
      formats: [...readResult.inspection.summary.formats],
      warnings: [...readResult.inspection.summary.warnings],
    }

    this.candidateClient = new CandidateWorkerClient()
    this.updateProgress({
      phase: 'searching-candidates',
      percent: 61,
      processed: 0,
      total: images.length,
      candidates: 0,
      message: 'Ähnliche Bildpaare werden gesucht',
      startedAt,
    })
    const edges = await this.candidateClient.search(images, settings, (candidateProgress) => {
      const ratio = candidateProgress.processed / Math.max(1, candidateProgress.total)
      const searching = candidateProgress.stage === 'searching-candidates'
      this.updateProgress({
        phase: candidateProgress.stage,
        percent: searching ? 61 + ratio * 17 : 78 + ratio * 15,
        processed: candidateProgress.processed,
        total: candidateProgress.total,
        candidates: candidateProgress.candidates,
        message: searching ? 'Kandidaten werden über Fingerabdrücke gesucht' : 'Kandidaten werden strukturell verglichen',
        startedAt,
      }, true)
    })
    this.candidateClient = undefined
    this.assertNotCancelled()

    this.updateProgress({ phase: 'creating-groups', percent: 94, processed: images.length, total: images.length, candidates: edges.length, message: 'Treffer werden in prüfbare Gruppen geordnet', startedAt })
    const groups = createDuplicateGroups(edges, images)
    this.updateProgress({ phase: 'preparing-results', percent: 98, processed: images.length, total: images.length, candidates: edges.length, message: 'Ergebnisse werden vorbereitet', startedAt })

    const result: AnalysisResult = {
      version: __APP_VERSION__,
      zipFingerprint,
      zipName: file.name,
      zipSize: file.size,
      analyzedAt: new Date().toISOString(),
      settings,
      summary,
      images,
      edges,
      groups,
      comparisonDecisions: {},
      errors,
    }
    if (this.cache && this.cacheWritable) {
      try {
        await this.waitUntilResumed()
        this.assertNotCancelled()
        await this.raceWithAbort(this.cache.saveAnalysis(result))
        await this.waitUntilResumed()
        this.assertNotCancelled()
      } catch (cacheError) {
        if (this.isAbort(cacheError)) throw cacheError
        const storageError: AppError = {
          id: crypto.randomUUID(),
          code: 'storage-unavailable',
          message: 'Das Analyseergebnis konnte nicht dauerhaft zwischengespeichert werden.',
          detail: cacheError instanceof Error ? cacheError.message : String(cacheError),
          phase: 'preparing-results',
          recoverable: true,
        }
        result.errors.push(storageError)
        this.callbacks.onError(storageError)
      }
    }

    const elapsedMs = Date.now() - startedAt
    const slowThresholdMs = Math.max(SLOW_ANALYSIS_BASE_MS, images.length * SLOW_ANALYSIS_PER_IMAGE_MS)
    this.updateProgress({
      phase: 'completed',
      percent: 100,
      processed: images.length,
      total: images.length,
      candidates: edges.length,
      message: 'Analyse abgeschlossen',
      startedAt,
      warning: elapsedMs >= slowThresholdMs
        ? `UngewÃ¶hnlich langsamer Lauf: ${Math.round(elapsedMs / 1000).toLocaleString('de-DE')} Sekunden fÃ¼r ${images.length.toLocaleString('de-DE')} Bilder.`
        : this.progress.warning,
    })
    return result
  }

  pause(): void {
    if (this.paused || this.cancelled) return
    this.paused = true
    this.pausedAt = Date.now()
    this.phaseBeforePause = this.progress.phase
    this.imagePool?.pause()
    this.candidateClient?.pause()
    this.updateProgress({ phase: 'paused', message: 'Analyse pausiert' })
  }

  resume(): void {
    if (!this.paused || this.cancelled) return
    this.paused = false
    if (this.pausedAt !== undefined) {
      this.phaseStartedAt += Math.max(0, Date.now() - this.pausedAt)
      this.pausedAt = undefined
    }
    this.imagePool?.resume()
    this.candidateClient?.resume()
    this.updateProgress({ phase: this.phaseBeforePause, message: 'Analyse wird fortgesetzt' })
    for (const resolve of this.resumeWaiters.splice(0)) resolve()
  }

  cancel(): void {
    if (this.cancelled) return
    this.cancelled = true
    this.paused = false
    this.abortController.abort(new DOMException('Analyse abgebrochen', 'AbortError'))
    this.imagePool?.cancel()
    this.candidateClient?.cancel()
    for (const resolve of this.resumeWaiters.splice(0)) resolve()
    this.updateProgress({ phase: 'cancelled', message: 'Analyse abgebrochen' })
  }

  private updateProgress(update: Partial<AnalysisProgress>, throttle = false): void {
    const now = Date.now()
    const previousPhase = this.progress.phase
    const nextPhase = update.phase ?? previousPhase
    if (nextPhase !== previousPhase && previousPhase !== 'idle' && previousPhase !== 'paused') {
      this.phaseTimings[previousPhase] = (this.phaseTimings[previousPhase] ?? 0) + Math.max(0, now - this.phaseStartedAt)
      this.phaseStartedAt = now
    }
    this.progress = {
      ...this.progress,
      ...update,
      phaseStartedAt: this.phaseStartedAt,
      timings: { ...this.phaseTimings },
      imageTimings: { ...this.imageTimings },
    }
    if (throttle && now - this.lastProgressNotificationAt < PROGRESS_THROTTLE_MS) return
    this.lastProgressNotificationAt = now
    this.callbacks.onProgress(this.progress)
  }

  private handleThumbnailCacheError(error: unknown, errors: AppError[]): void {
    this.cacheWritable = false
    if (this.cacheErrorReported) return
    this.cacheErrorReported = true
    const storageError: AppError = {
      id: crypto.randomUUID(),
      code: 'storage-unavailable',
      message: 'Eine Vorschau konnte nicht dauerhaft zwischengespeichert werden.',
      detail: error instanceof Error ? error.message : String(error),
      phase: 'creating-previews',
      recoverable: true,
    }
    errors.push(storageError)
    this.callbacks.onError(storageError)
  }

  private async waitUntilResumed(): Promise<void> {
    if (!this.paused) return
    await new Promise<void>((resolve) => this.resumeWaiters.push(resolve))
  }

  private assertNotCancelled(): void {
    if (this.cancelled || this.abortController.signal.aborted) throw new DOMException('Analyse abgebrochen', 'AbortError')
  }

  private isAbort(error: unknown): boolean {
    return (error instanceof DOMException && error.name === 'AbortError')
      || (error instanceof Error && error.name === 'AbortError')
      || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'cancelled')
  }

  private async raceWithAbort<T>(operation: Promise<T>): Promise<T> {
    this.assertNotCancelled()
    const signal = this.abortController.signal
    return await new Promise<T>((resolve, reject) => {
      const abort = () => reject(signal.reason instanceof Error
        ? signal.reason
        : new DOMException('Analyse abgebrochen', 'AbortError'))
      signal.addEventListener('abort', abort, { once: true })
      operation.then(
        (value) => {
          signal.removeEventListener('abort', abort)
          resolve(value)
        },
        (error) => {
          signal.removeEventListener('abort', abort)
          reject(error)
        },
      )
    })
  }
}
