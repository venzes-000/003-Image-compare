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

export class ImageWorkerPool {
  private readonly slots: WorkerSlot[] = []
  private readonly queue: PendingTask[] = []
  private paused = false
  private cancelled = false
  private readonly useWorkers: boolean
  readonly capacity: number

  constructor(workerCount: number) {
    this.useWorkers =
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof createImageBitmap !== 'undefined'
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
        task?.reject(new Error(event.message || 'Ein Bildanalyse-Worker ist ausgefallen.'))
        this.dispatch()
      }
      this.slots.push(slot)
    }
  }

  analyze(payload: AnalyzeImagePayload): Promise<ImageAnalyzedPayload> {
    if (this.cancelled) return Promise.reject(new DOMException('Analyse abgebrochen', 'AbortError'))
    if (!this.useWorkers) return analyzeImageOnMainThread(payload)

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
      slot.worker.postMessage({ type: 'ANALYZE_IMAGE', payload: task.payload }, [task.payload.buffer])
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
