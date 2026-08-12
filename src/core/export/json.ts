import type { AnalysisResult, Decision, ImageFeatureRecord } from '../types'
import {
  effectiveCandidateRotationDegrees,
  groupCandidateIds,
  resolveComparisonDecision,
  resolveGroupComparison,
  type GroupCandidateKind,
  type ResultPresentationTier,
} from '../clustering'
import type { QuarterTurn } from '../types'

export interface JsonReportOptions {
  pretty?: boolean
  exportedAt?: string
}

export interface ExportedImageRecord extends Omit<ImageFeatureRecord, 'gray'> {}

export interface JsonAnalysisReport extends Omit<AnalysisResult, 'images'> {
  exportFormat: 'lokale-bildpruefung-json'
  exportVersion: 4
  exportedAt: string
  metadataNotice: string
  images: ExportedImageRecord[]
  comparisons: ExportedGroupComparison[]
}

export interface ExportedGroupComparison {
  groupId: string
  groupReferenceId: string
  comparisonBaseId: string
  candidateId: string
  edgeId?: string
  directToReference: boolean
  effectiveCandidateRotationDegrees: QuarterTurn
  candidateKind: GroupCandidateKind
  presentationTier: ResultPresentationTier
  decision: Decision
}

export function createJsonReport(result: AnalysisResult, options: JsonReportOptions = {}): string {
  const report = createJsonReportData(result, options.exportedAt)
  return JSON.stringify(report, null, options.pretty === false ? undefined : 2)
}

export function createJsonReportData(result: AnalysisResult, exportedAt = new Date().toISOString()): JsonAnalysisReport {
  const edgesById = new Map(result.edges.map((edge) => [edge.id, edge]))
  return {
    ...result,
    exportFormat: 'lokale-bildpruefung-json',
    exportVersion: 4,
    exportedAt,
    metadataNotice: 'Dieser bewusst erzeugte JSON-Export kann EXIF-Aufnahmezeiten, Kameraangaben und genaue GPS-Koordinaten enthalten. Bitte entsprechend vertraulich behandeln.',
    summary: {
      ...result.summary,
      formats: [...result.summary.formats],
      warnings: [...result.summary.warnings],
    },
    settings: { ...result.settings },
    images: result.images.map(withoutAnalysisPixels),
    edges: result.edges.map((edge) => ({
      ...edge,
      reasons: [...edge.reasons],
      metrics: { ...edge.metrics },
      ...(edge.metadata ? { metadata: { ...edge.metadata, reasons: [...edge.metadata.reasons] } } : {}),
    })),
    groups: result.groups.map((group) => ({
      ...group,
      memberIds: [...group.memberIds],
      uncertainIds: [...group.uncertainIds],
      edgeIds: [...group.edgeIds],
    })),
    comparisons: result.groups.flatMap((group) => groupCandidateIds(group).map((candidateId) => {
      const resolved = resolveGroupComparison(group, candidateId, edgesById)
      return {
        groupId: group.id,
        groupReferenceId: group.referenceId,
        comparisonBaseId: resolved.baseImageId,
        candidateId,
        ...(resolved.edge ? { edgeId: resolved.edge.id } : {}),
        directToReference: resolved.directToReference,
        effectiveCandidateRotationDegrees: effectiveCandidateRotationDegrees(resolved.edge, candidateId),
        candidateKind: resolved.candidateKind,
        presentationTier: resolved.presentationTier,
        decision: resolveComparisonDecision(
          resolved,
          result.comparisonDecisions,
          result.images.find((image) => image.id === candidateId)?.decision,
        ),
      }
    })),
    errors: result.errors.map((error) => ({ ...error })),
  }
}

export function createJsonBlob(result: AnalysisResult, options: JsonReportOptions = {}): Blob {
  return new Blob([createJsonReport(result, options)], { type: 'application/json;charset=utf-8' })
}

function withoutAnalysisPixels(image: ImageFeatureRecord): ExportedImageRecord {
  const { gray, metadata, ...record } = image
  void gray
  return {
    ...record,
    histogram: [...record.histogram],
    ...(metadata ? { metadata: { ...metadata, warnings: [...metadata.warnings] } } : {}),
  }
}
