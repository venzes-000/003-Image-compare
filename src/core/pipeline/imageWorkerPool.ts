import { analyzeImageOnMainThread } from '../image/mainThreadAnalysis'
import type { AnalyzeImagePayload, ImageAnalyzedPayload, ImageWorkerResponse } from '../../workers/workerProtocol'

interface PendingTask {
  payload: AnalyzeImagePayload
  resolve: (value: ImageAnalyzedPayload) => void
  reject: (reason: Error) => void
}

interface WorkerSlot {
  worker: Worker
  task?: PendingTask
}

export interface ImageWorkerPoolOptions {
  onRuntimeFallback?: (reason: string) => void
}

export class ImageWorkerPoolUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageWorkerPoolUnavailableError'
  }
}

export class ImageWorkerPool {
  private readonly slots: WorkerSlot[] = []
  private readonly queue: PendingTask[] = []
  private paused = false
  private cancelled = false
  private readonly useWorkers: boolean
  private readonly onRuntimeFallback?: (reason: string) => void
  private runtimeFailureReported = false
  private terminalWorkerFailure?: Error
  readonly mode: 'worker-pool' | 'main-thread'
  readonly fallbackReason?: string
  readonly capacity: number

  constructor(workerCount: number, options: ImageWorkerPoolOptions = {}) {
    this.onRuntimeFallback = options.onRuntimeFallback
    const unavailable: string[] = []
    if (typeof Worker === 'undefined') unavailable.push('Web Worker fehlen')
    if (typeof OffscreenCanvas === 'undefined') unavailable.push('OffscreenCanvas fehlt')
    if (typeof createImageBitmap === 'undefined') unavailable.push('createImageBitmap fehlt')
    this.useWorkers = unavailable.length === 0
    this.mode = this.useWorkers ? 'worker-pool' : 'main-thread'
    this.fallbackReason = unavailable.length > 0 ? unavailable.join(', ') : undefined
    this.capacity = this.useWorkers ? workerCount : 1

    if (!this.useWorkers) return
    for (let index = 0; index < this.capacity; index += 1) {
      const worker = new Worker(new URL('../../workers/imageAnalysis.worker.ts', import.meta.url), {
        type: 'module',
        name: `bildanalyse-${index + 1}`,
      })
      const slot: WorkerSlot = { worker }
      worker.onmessage = (event: MessageEvent<ImageWorkerResponse>) => this.handleMessage(slot, event.data)
      worker.onerror = (event) => {
        const task = slot.task
        slot.task = undefined
        slot.worker.terminate()
        const slotIndex = this.slots.indexOf(slot)
        if (slotIndex >= 0) this.slots.splice(slotIndex, 1)
        const message = event.message || 'Ein Bildanalyse-Worker ist beim Start oder während der Verarbeitung ausgefallen.'
        if (!this.runtimeFailureReported) {
          this.runtimeFailureReported = true
          this.onRuntimeFallback?.(message)
        }
        if (this.slots.length === 0) {
          const failure = new ImageWorkerPoolUnavailableError(`${message} Es ist kein Bildanalyse-Worker mehr verfügbar.`)
          this.terminalWorkerFailure = failure
          task?.reject(failure)
          while (this.queue.length > 0) this.queue.shift()?.reject(failure)
        } else {
          task?.reject(new ImageWorkerPoolUnavailableError(`${message} Bitte prüfen Sie Browser-Energiesparmodus und Worker-Freigaben.`))
        }
        this.dispatch()
      }
      this.slots.push(slot)
    }
  }

  analyze(payload: AnalyzeImagePayload): Promise<ImageAnalyzedPayload> {
    if (this.cancelled) return Promise.reject(new DOMException('Analyse abgebrochen', 'AbortError'))
    if (!this.useWorkers) return analyzeImageOnMainThread(payload)
    if (this.terminalWorkerFailure) return Promise.reject(this.terminalWorkerFailure)

    return new Promise((resolve, reject) => {
      this.queue.push({ payload, resolve, reject })
      this.dispatch()
    })
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    this.dispatch()
  }

  cancel(): void {
    this.cancelled = true
    const cancellation = new DOMException('Analyse abgebrochen', 'AbortError')
    while (this.queue.length > 0) this.queue.shift()?.reject(cancellation)
    for (const slot of this.slots) {
      slot.task?.reject(cancellation)
      slot.task = undefined
      slot.worker.postMessage({ type: 'CANCEL' })
      slot.worker.terminate()
    }
  }

  dispose(): void {
    for (const slot of this.slots) slot.worker.terminate()
    this.slots.length = 0
  }

  private dispatch(): void {
    if (this.paused || this.cancelled) return
    for (const slot of this.slots) {
      if (slot.task) continue
      const task = this.queue.shift()
      if (!task) break
      slot.task = task
      try {
        slot.worker.postMessage({ type: 'ANALYZE_IMAGE', payload: task.payload }, [task.payload.buffer])
      } catch (error) {
        slot.task = undefined
        const message = error instanceof Error ? error.message : String(error)
        task.reject(new ImageWorkerPoolUnavailableError(`Der Auftrag konnte nicht an den Bildanalyse-Worker übertragen werden: ${message}`))
        queueMicrotask(() => this.dispatch())
      }
    }
  }

  private handleMessage(slot: WorkerSlot, response: ImageWorkerResponse): void {
    const task = slot.task
    if (!task) return
    if (response.type === 'ERROR') {
      const detail = response.payload.detail ? `\n${response.payload.detail}` : ''
      task.reject(new Error(`${response.payload.message}${detail}`))
    } else {
      task.resolve(response.payload)
    }
    slot.task = undefined
    this.dispatch()
  }
}
