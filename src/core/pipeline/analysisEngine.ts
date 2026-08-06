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
import { ImageWorkerPool } from './imageWorkerPool'

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

  constructor(callbacks: AnalysisEngineCallbacks, cache?: AnalysisCacheAdapter) {
    this.callbacks = callbacks
    this.cache = cache
  }

  async run(file: File, settings: AnalysisSettings): Promise<AnalysisResult> {
    const startedAt = Date.now()
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
    let decodeErrorCount = 0
    this.imagePool = new ImageWorkerPool(settings.workerCount)

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
          },
          buffer,
        })
        if (!analyzedImage) throw new Error('Die Bildanalyse wurde unerwartet beendet.')
        images.push(analyzedImage.feature)
        const thumbnail = new Blob([analyzedImage.thumbnail], { type: analyzedImage.thumbnailMime })
        thumbnailStore.set(analyzedImage.feature.thumbnailKey, thumbnail)
        if (this.cache && this.cacheWritable) {
          try {
            await this.cache.saveThumbnail(zipFingerprint, analyzedImage.feature.thumbnailKey, thumbnail)
          } catch (cacheError) {
            this.cacheWritable = false
            const storageError: AppError = {
              id: crypto.randomUUID(),
              code: 'storage-unavailable',
              message: 'Eine Vorschau konnte nicht dauerhaft zwischengespeichert werden.',
              detail: cacheError instanceof Error ? cacheError.message : String(cacheError),
              phase: 'creating-previews',
              recoverable: true,
            }
            errors.push(storageError)
            this.callbacks.onError(storageError)
          }
        }
      } catch (error) {
        if (this.isAbort(error)) throw error
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
          message: ratio < 0.45 ? 'Vorschaubilder werden erzeugt' : 'Visuelle Fingerabdrücke werden berechnet',
          startedAt,
        })
      }
    }

    const readResult = await zipArchiveService.readImages(
      file,
      async (image) => {
        await this.waitUntilResumed()
        this.assertNotCancelled()
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
    this.imagePool.dispose()
    this.imagePool = undefined
    errors.push(...readResult.errors)
    for (const error of readResult.errors) this.callbacks.onError(error)
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
      })
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
      errors,
    }
    if (this.cache && this.cacheWritable) {
      try {
        await this.cache.saveAnalysis(result)
      } catch (cacheError) {
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

    this.updateProgress({ phase: 'completed', percent: 100, processed: images.length, total: images.length, candidates: edges.length, message: 'Analyse abgeschlossen', startedAt })
    return result
  }

  pause(): void {
    if (this.paused || this.cancelled) return
    this.paused = true
    this.phaseBeforePause = this.progress.phase
    this.imagePool?.pause()
    this.candidateClient?.pause()
    this.updateProgress({ phase: 'paused', message: 'Analyse pausiert' })
  }

  resume(): void {
    if (!this.paused || this.cancelled) return
    this.paused = false
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

  private updateProgress(update: Partial<AnalysisProgress>): void {
    this.progress = { ...this.progress, ...update }
    this.callbacks.onProgress(this.progress)
  }

  private async waitUntilResumed(): Promise<void> {
    if (!this.paused) return
    await new Promise<void>((resolve) => this.resumeWaiters.push(resolve))
  }

  private assertNotCancelled(): void {
    if (this.cancelled || this.abortController.signal.aborted) throw new DOMException('Analyse abgebrochen', 'AbortError')
  }

  private isAbort(error: unknown): boolean {
    return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')
  }
}
