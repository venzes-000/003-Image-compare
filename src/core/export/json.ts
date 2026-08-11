import type { AnalysisResult, ImageFeatureRecord } from '../types'

export interface JsonReportOptions {
  pretty?: boolean
  exportedAt?: string
}

export interface ExportedImageRecord extends Omit<ImageFeatureRecord, 'gray'> {}

export interface JsonAnalysisReport extends Omit<AnalysisResult, 'images'> {
  exportFormat: 'lokale-bildpruefung-json'
  exportVersion: 2
  exportedAt: string
  metadataNotice: string
  images: ExportedImageRecord[]
}

export function createJsonReport(result: AnalysisResult, options: JsonReportOptions = {}): string {
  const report = createJsonReportData(result, options.exportedAt)
  return JSON.stringify(report, null, options.pretty === false ? undefined : 2)
}

export function createJsonReportData(result: AnalysisResult, exportedAt = new Date().toISOString()): JsonAnalysisReport {
  return {
    ...result,
    exportFormat: 'lokale-bildpruefung-json',
    exportVersion: 2,
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
