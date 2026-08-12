import type {
  AnalysisSettings,
  CandidateEdge,
  ImageFeatureRecord,
  SupportedImageFormat,
} from '../core/types'

export interface AnalyzeImagePayload {
  taskId: string
  image: {
    id: string
    path: string
    name: string
    size: number
    compressedSize: number
    mime: string
    format: SupportedImageFormat
    archiveModifiedAt?: string
  }
  buffer: ArrayBuffer
}

export type ImageWorkerRequest =
  | { type: 'ANALYZE_IMAGE'; payload: AnalyzeImagePayload }
  | { type: 'CANCEL' }

export interface ImageAnalyzedPayload {
  taskId: string
  feature: ImageFeatureRecord
  thumbnail: ArrayBuffer
  thumbnailMime: string
  timings: {
    metadataMs: number
    decodeMs: number
    analysisMs: number
    thumbnailMs: number
    totalMs: number
  }
}

export type ImageWorkerResponse =
  | { type: 'IMAGE_ANALYZED'; payload: ImageAnalyzedPayload }
  | { type: 'ERROR'; payload: { taskId?: string; message: string; detail?: string } }

export type CandidateWorkerRequest =
  | {
      type: 'SEARCH_CANDIDATES'
      payload: { images: ImageFeatureRecord[]; settings: AnalysisSettings }
    }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'CANCEL' }

export type CandidateWorkerResponse =
  | {
      type: 'PROGRESS'
      payload: {
        stage: 'searching-candidates' | 'comparing-candidates'
        processed: number
        total: number
        candidates: number
      }
    }
  | { type: 'CANDIDATES_FOUND'; payload: { edges: CandidateEdge[] } }
  | { type: 'ERROR'; payload: { message: string; detail?: string } }
