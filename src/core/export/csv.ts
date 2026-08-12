import type {
  AnalysisResult,
  CandidateEdge,
  Decision,
  DuplicateGroup,
  ImageFeatureRecord,
  MetadataAssessment,
} from '../types'
import {
  effectiveCandidateRotationDegrees,
  groupCandidateIds,
  resolveComparisonDecision,
  resolveGroupComparison,
  type ResolvedGroupComparison,
} from '../clustering'

export const CSV_BOM = '\ufeff'
export const DEFAULT_CSV_DELIMITER = ';'

export interface CsvOptions {
  delimiter?: ',' | ';' | '\t'
  includeBom?: boolean
  /** Exact coordinates are deliberately excluded unless explicitly requested. */
  includeExactGps?: boolean
}

export const CSV_REPORT_HEADERS = [
  'Gruppen-ID',
  'Status',
  'Ergebnisbereich',
  'Gruppenreferenzdatei',
  'Vergleichsbasisdatei',
  'Kandidatendatei',
  'Gruppenreferenzpfad',
  'Vergleichbasispfad',
  'Kandidatenpfad',
  'Kanten-ID',
  'Verbindung zur Gruppenreferenz',
  'Bildähnlichkeit (0-100)',
  'Effektive Kandidatendrehung (Grad)',
  'Kategorie',
  'Nutzerentscheidung',
  'pHash-Distanz',
  'dHash-Distanz',
  'SSIM',
  'Histogramm-Ähnlichkeit',
  'Feature-Matching-Wert',
  'KI-Ähnlichkeit',
  'Vergleichsbasisbreite',
  'Vergleichbasishöhe',
  'Kandidatenbreite',
  'Kandidatenhöhe',
  'Vergleichsbasisformat',
  'Kandidatenformat',
  'Vergleichsbasis-Aufnahmezeit',
  'Kandidaten-Aufnahmezeit',
  'Vergleichsbasis-Archivänderung',
  'Kandidaten-Archivänderung',
  'Vergleichsbasiskamera',
  'Kandidatenkamera',
  'Vergleichsbasisobjektiv',
  'Kandidatenobjektiv',
  'Vergleichsbasis-GPS vorhanden',
  'Kandidaten-GPS vorhanden',
  'Metadatenstatus',
  'Metadaten-Kontextwert',
  'GPS-Abstand (m)',
  'Zeitabstand (s)',
  'Gleiches Kameramodell',
  'Metadatenhinweise',
] as const

const EXACT_GPS_HEADERS = [
  'Vergleichsbasis-Breitengrad',
  'Vergleichsbasis-Längengrad',
  'Kandidaten-Breitengrad',
  'Kandidaten-Längengrad',
] as const

export function createCsvReport(result: AnalysisResult, options: CsvOptions = {}): string {
  const includeExactGps = options.includeExactGps === true
  const rows: unknown[][] = [[
    ...CSV_REPORT_HEADERS,
    ...(includeExactGps ? EXACT_GPS_HEADERS : []),
  ]]
  const images = new Map(result.images.map((image) => [image.id, image]))
  const edges = new Map(result.edges.map((edge) => [edge.id, edge]))

  for (const group of result.groups) {
    const reference = images.get(group.referenceId)
    if (reference === undefined) continue
    for (const candidateId of groupCandidateIds(group)) {
      const candidate = images.get(candidateId)
      if (candidate === undefined) continue
      const comparison = resolveGroupComparison(group, candidate.id, edges)
      const comparisonBase = images.get(comparison.baseImageId) ?? reference
      const comparisonDecision = resolveComparisonDecision(comparison, result.comparisonDecisions, candidate.decision)
      rows.push(csvReportRow(group, reference, comparisonBase, candidate, comparison, comparisonDecision, includeExactGps))
    }
  }
  return formatCsv(rows, options)
}

export function createCsvBlob(result: AnalysisResult, options: CsvOptions = {}): Blob {
  return new Blob([createCsvReport(result, options)], { type: 'text/csv;charset=utf-8' })
}

export function formatCsv(rows: readonly (readonly unknown[])[], options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? DEFAULT_CSV_DELIMITER
  const includeBom = options.includeBom ?? true
  const content = rows
    .map((row) => row.map((value) => escapeCsvCell(value, delimiter)).join(delimiter))
    .join('\r\n')
  return `${includeBom ? CSV_BOM : ''}${content}\r\n`
}

/**
 * Escapes CSV syntax and neutralizes strings which spreadsheet applications
 * could otherwise execute as formulas. Numeric values remain numeric.
 */
export function escapeCsvCell(value: unknown, delimiter = DEFAULT_CSV_DELIMITER): string {
  let text: string
  if (value === null || value === undefined) {
    text = ''
  } else if (value instanceof Date) {
    text = value.toISOString()
  } else {
    text = String(value)
  }

  if (typeof value === 'string' && isFormulaLike(text)) {
    text = `'${text}`
  }
  if (text.includes(delimiter) || text.includes('"') || text.includes('\r') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export function neutralizeSpreadsheetFormula(value: string): string {
  return isFormulaLike(value) ? `'${value}` : value
}

function isFormulaLike(value: string): boolean {
  return /^[\t\r\n ]*[=+\-@]/.test(value) || /^[\t\r]/.test(value)
}

function csvReportRow(
  group: DuplicateGroup,
  groupReference: ImageFeatureRecord,
  comparisonBase: ImageFeatureRecord,
  candidate: ImageFeatureRecord,
  comparison: ResolvedGroupComparison,
  comparisonDecision: Decision,
  includeExactGps: boolean,
): unknown[] {
  const edge = comparison.edge
  const row: unknown[] = [
    group.id,
    comparisonDecision === 'duplicate' || comparisonDecision === 'different' ? 'Geprüft' : 'Ungeprüft',
    presentationTierLabel(comparison.presentationTier),
    groupReference.name,
    comparisonBase.name,
    candidate.name,
    groupReference.path,
    comparisonBase.path,
    candidate.path,
    edge?.id,
    comparison.directToReference ? 'Direkt' : 'Indirekt über Gruppenmitglied',
    edge?.score,
    effectiveCandidateRotationDegrees(edge, candidate.id),
    edge === undefined ? undefined : categoryLabel(edge.category),
    decisionLabel(comparisonDecision),
    edge?.metrics.pHashDistance,
    edge?.metrics.dHashDistance,
    edge?.metrics.ssim,
    edge?.metrics.histogramSimilarity,
    edge?.metrics.featureMatchScore,
    edge?.metrics.aiSimilarity,
    comparisonBase.width,
    comparisonBase.height,
    candidate.width,
    candidate.height,
    comparisonBase.format.toUpperCase(),
    candidate.format.toUpperCase(),
    comparisonBase.metadata?.capturedAt,
    candidate.metadata?.capturedAt,
    comparisonBase.metadata?.archiveModifiedAt,
    candidate.metadata?.archiveModifiedAt,
    cameraLabel(comparisonBase),
    cameraLabel(candidate),
    comparisonBase.metadata?.lensModel,
    candidate.metadata?.lensModel,
    yesNo(hasGps(comparisonBase)),
    yesNo(hasGps(candidate)),
    metadataStatusLabel(edge?.metadata?.status),
    edge?.metadata?.contextScore,
    edge?.metadata?.gpsDistanceMeters,
    edge?.metadata?.captureTimeDifferenceSeconds,
    yesNo(edge?.metadata?.sameCameraModel),
    edge?.metadata?.reasons.join(' | '),
  ]

  if (includeExactGps) {
    row.push(
      comparisonBase.metadata?.latitude,
      comparisonBase.metadata?.longitude,
      candidate.metadata?.latitude,
      candidate.metadata?.longitude,
    )
  }
  return row
}

function cameraLabel(image: ImageFeatureRecord): string | undefined {
  const parts = [image.metadata?.cameraMake, image.metadata?.cameraModel].filter(
    (value): value is string => Boolean(value),
  )
  return parts.length > 0 ? parts.join(' ') : undefined
}

function hasGps(image: ImageFeatureRecord): boolean {
  return Number.isFinite(image.metadata?.latitude) && Number.isFinite(image.metadata?.longitude)
}

function yesNo(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? 'Ja' : 'Nein'
}

function metadataStatusLabel(status: MetadataAssessment['status'] | undefined): string | undefined {
  if (status === 'corroborates') return 'Stützt den visuellen Treffer'
  if (status === 'conflicts') return 'Widersprüchlicher Kontext'
  if (status === 'neutral') return 'Neutraler Kontext'
  if (status === 'unavailable') return 'Nicht verfügbar'
  return undefined
}

function decisionLabel(decision: ImageFeatureRecord['decision']): string {
  if (decision === 'duplicate') return 'Duplikat bestätigt'
  if (decision === 'different') return 'Kein Duplikat'
  if (decision === 'later') return 'Später prüfen'
  return 'Ungeprüft'
}

function categoryLabel(category: CandidateEdge['category']): string {
  if (category === 'almost-certain-duplicate') return 'Sehr wahrscheinlich identisch'
  if (category === 'probable-duplicate') return 'Wahrscheinliches Duplikat'
  if (category === 'needs-review') return 'Manuell prüfen'
  return 'Wahrscheinlich verschieden'
}

function presentationTierLabel(tier: ResolvedGroupComparison['presentationTier']): string {
  if (tier === 'strong') return 'Starker Treffer'
  if (tier === 'manual-review') return 'Manuell prüfen'
  return 'Niedrige Priorität'
}
