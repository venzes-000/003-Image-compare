import type { AnalysisSettings, CandidateEdge, ImageFeatureRecord } from '../types'
import type { CandidateWorkerResponse } from '../../workers/workerProtocol'

export interface CandidateProgress {
  stage: 'searching-candidates' | 'comparing-candidates'
  processed: number
  total: number
  candidates: number
}

export class CandidateWorkerClient {
  private worker?: Worker
  private rejectPending?: (reason: Error) => void

  search(
    images: ImageFeatureRecord[],
    settings: AnalysisSettings,
    onProgress: (progress: CandidateProgress) => void,
  ): Promise<CandidateEdge[]> {
    if (typeof Worker === 'undefined') {
      return Promise.reject(new Error('Web Worker werden für die Kandidatensuche benötigt.'))
    }

    this.worker = new Worker(new URL('../../workers/candidateSearch.worker.ts', import.meta.url), {
      type: 'module',
      name: 'kandidatensuche',
    })

    return new Promise((resolve, reject) => {
      this.rejectPending = reject
      const worker = this.worker
      if (!worker) return
      worker.onmessage = (event: MessageEvent<CandidateWorkerResponse>) => {
        const response = event.data
        if (response.type === 'PROGRESS') {
          onProgress(response.payload)
          return
        }
        if (response.type === 'ERROR') {
          const detail = response.payload.detail ? `\n${response.payload.detail}` : ''
          reject(new Error(`${response.payload.message}${detail}`))
          this.dispose()
          return
        }
        resolve(response.payload.edges)
        this.dispose()
      }
      worker.onerror = (event) => {
        reject(new Error(event.message || 'Die Kandidatensuche ist fehlgeschlagen.'))
        this.dispose()
      }
      worker.postMessage({ type: 'SEARCH_CANDIDATES', payload: { images, settings } })
    })
  }

  pause(): void {
    this.worker?.postMessage({ type: 'PAUSE' })
  }

  resume(): void {
    this.worker?.postMessage({ type: 'RESUME' })
  }

  cancel(): void {
    this.worker?.postMessage({ type: 'CANCEL' })
    this.rejectPending?.(new DOMException('Analyse abgebrochen', 'AbortError'))
    this.dispose()
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = undefined
    this.rejectPending = undefined
  }
}
