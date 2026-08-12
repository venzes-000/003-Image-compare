export type SupportedImageFormat =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'heic'
  | 'avif'
  | 'gif'
  | 'bmp'
  | 'tiff'
export type SensitivityMode = 'strict' | 'balanced' | 'sensitive'
export type Decision = 'unreviewed' | 'duplicate' | 'different' | 'later'
export type GroupStatus = 'unreviewed' | 'reviewed'

export type AnalysisPhase =
  | 'idle'
  | 'validating-zip'
  | 'collecting-files'
  | 'creating-previews'
  | 'calculating-fingerprints'
  | 'searching-candidates'
  | 'comparing-candidates'
  | 'creating-groups'
  | 'preparing-results'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'error'

export interface AnalysisSettings {
  mode: SensitivityMode
  workerCount: number
  pHashThreshold: number
  dHashThreshold: number
  aHashThreshold: number
  minimumSsim: number
  minimumHistogramSimilarity: number
  candidateLimitPerImage: number
}

export interface ZipSummary {
  totalEntries: number
  supportedImages: number
  skippedEntries: number
  corruptedImages: number
  totalUncompressedBytes: number
  formats: SupportedImageFormat[]
  warnings: string[]
}

export type QuarterTurn = 0 | 90 | 180 | 270

export interface RotatedHashVariant {
  rotationDegrees: QuarterTurn
  aspectRatio: number
  aHash: string
  dHash: string
  pHash: string
}

export interface ImageFeatureRecord {
  id: string
  path: string
  name: string
  size: number
  compressedSize: number
  mime: string
  format: SupportedImageFormat
  width: number
  height: number
  aspectRatio: number
  aHash: string
  dHash: string
  pHash: string
  /**
   * Hashes of the already-downscaled analysis image at all quarter turns.
   * This keeps orientation matching cheap and avoids decoding the original
   * image four times. Optional for backwards-compatible cached analyses.
   */
  rotationVariants?: RotatedHashVariant[]
  histogram: number[]
  luminanceMean: number
  metadata?: CaptureMetadata
  gray: Uint8Array
  thumbnailKey: string
  decision: Decision
}

export interface CaptureMetadata {
  latitude?: number
  longitude?: number
  altitudeMeters?: number
  capturedAt?: string
  captureTimeHasTimezone?: boolean
  cameraMake?: string
  cameraModel?: string
  lensModel?: string
  software?: string
  orientation?: number
  archiveModifiedAt?: string
  warnings: string[]
}

export interface MetadataAssessment {
  status: 'corroborates' | 'neutral' | 'conflicts' | 'unavailable'
  contextScore?: number
  gpsDistanceMeters?: number
  captureTimeDifferenceSeconds?: number
  sameCameraModel?: boolean
  reasons: string[]
}

export interface SimilarityMetrics {
  aHashDistance?: number
  dHashDistance?: number
  pHashDistance?: number
  ssim?: number
  histogramSimilarity?: number
  featureMatchScore?: number
  aiSimilarity?: number
  aspectRatioDifference?: number
  resolutionRatio?: number
  /** Clockwise rotation applied to the target analysis image before comparison. */
  alignmentRotationDegrees?: QuarterTurn
}

export type SimilarityCategory =
  | 'almost-certain-duplicate'
  | 'probable-duplicate'
  | 'needs-review'
  | 'probably-different'

export interface SimilarityAssessment {
  score: number
  confidence: 'very-high' | 'high' | 'medium' | 'low'
  category: SimilarityCategory
  reasons: string[]
  metrics: SimilarityMetrics
}

export interface CandidateEdge extends SimilarityAssessment {
  id: string
  sourceId: string
  targetId: string
  strong: boolean
  metadata?: MetadataAssessment
}

export interface DuplicateGroup {
  id: string
  referenceId: string
  memberIds: string[]
  uncertainIds: string[]
  edgeIds: string[]
  status: GroupStatus
}

export interface AnalysisProgress {
  phase: AnalysisPhase
  percent: number
  processed: number
  total: number
  candidates: number
  startedAt?: number
  phaseStartedAt?: number
  timings?: Partial<Record<AnalysisPhase, number>>
  /** Summed worker CPU timings; decode and metadata can overlap and must not be added together as wall time. */
  imageTimings?: {
    images: number
    metadataMs: number
    decodeMs: number
    analysisMs: number
    thumbnailMs: number
    totalMs: number
  }
  execution?: {
    mode: 'worker-pool' | 'main-thread'
    workerCount: number
    fallbackReason?: string
  }
  warning?: string
  message: string
}

export interface AppError {
  id: string
  code:
    | 'invalid-zip'
    | 'encrypted-zip'
    | 'corrupt-entry'
    | 'unsupported-image'
    | 'corrupt-image'
    | 'limit-exceeded'
    | 'browser-unsupported'
    | 'storage-unavailable'
    | 'worker-error'
    | 'memory-pressure'
    | 'cancelled'
    | 'unknown'
  message: string
  detail?: string
  path?: string
  phase?: AnalysisPhase
  recoverable: boolean
}

export interface AnalysisResult {
  version: string
  zipFingerprint: string
  zipName: string
  zipSize: number
  analyzedAt: string
  settings: AnalysisSettings
  summary: ZipSummary
  images: ImageFeatureRecord[]
  edges: CandidateEdge[]
  groups: DuplicateGroup[]
  /** User decisions keyed by the concrete comparison edge, independent from file deletion decisions. */
  comparisonDecisions?: Record<string, Decision>
  errors: AppError[]
}

export interface CompatibilityItem {
  key: string
  label: string
  available: boolean
  required: boolean
  detail: string
}
