import type { AnalysisResult, Decision, ImageFeatureRecord } from '../types'
import { groupCandidateIds, resolveComparisonDecision, resolveGroupComparison } from '../clustering'
import { formatCsv, type CsvOptions } from './csv'

export type CleanedFileCategory = 'behalten' | 'bestätigtes-duplikat' | 'ungeklärt'

export interface CleanedFileRow {
  category: CleanedFileCategory
  path: string
  name: string
  decision: Decision
  groupIds: string[]
}

export function createCleanedFileRows(result: AnalysisResult): CleanedFileRow[] {
  const groupIdsByImage = new Map<string, Set<string>>()
  const candidateIds = new Set<string>()
  const referenceIds = new Set<string>()
  const relationDecisionsByImage = new Map<string, Decision[]>()
  const edgesById = new Map(result.edges.map((edge) => [edge.id, edge]))
  for (const group of result.groups) {
    referenceIds.add(group.referenceId)
    for (const imageId of new Set([...group.memberIds, ...group.uncertainIds, group.referenceId])) {
      const groupIds = groupIdsByImage.get(imageId) ?? new Set<string>()
      groupIds.add(group.id)
      groupIdsByImage.set(imageId, groupIds)
      if (imageId !== group.referenceId) candidateIds.add(imageId)
    }
    for (const candidateId of groupCandidateIds(group)) {
      const resolved = resolveGroupComparison(group, candidateId, edgesById)
      if (resolved.candidateKind !== 'manual-review') continue
      const decision = resolveComparisonDecision(resolved, result.comparisonDecisions)
      const decisions = relationDecisionsByImage.get(candidateId) ?? []
      decisions.push(decision)
      relationDecisionsByImage.set(candidateId, decisions)
    }
  }

  return [...result.images]
    .sort(compareImagesByPath)
    .map((image) => {
      const effectiveDecision = aggregateFileDecision(image.decision, relationDecisionsByImage.get(image.id) ?? [])
      return {
      category: classifyImage(image, effectiveDecision, candidateIds, referenceIds),
      path: image.path,
      name: image.name,
      decision: effectiveDecision,
      groupIds: [...(groupIdsByImage.get(image.id) ?? [])].sort(),
    }})
}

export function createCleanedFileList(result: AnalysisResult, options: CsvOptions = {}): string {
  const rows: unknown[][] = [['Kategorie', 'Relativer Pfad', 'Dateiname', 'Nutzerentscheidung', 'Gruppen-ID']]
  for (const entry of createCleanedFileRows(result)) {
    rows.push([entry.category, entry.path, entry.name, decisionLabel(entry.decision), entry.groupIds.join(', ')])
  }
  return formatCsv(rows, options)
}

function decisionLabel(decision: Decision): string {
  if (decision === 'duplicate') return 'Duplikat bestätigt'
  if (decision === 'different') return 'Kein Duplikat'
  if (decision === 'later') return 'Später prüfen'
  return 'Ungeprüft'
}

export function createCleanedFileListBlob(result: AnalysisResult, options: CsvOptions = {}): Blob {
  return new Blob([createCleanedFileList(result, options)], { type: 'text/csv;charset=utf-8' })
}

function classifyImage(
  image: ImageFeatureRecord,
  decision: Decision,
  candidateIds: ReadonlySet<string>,
  referenceIds: ReadonlySet<string>,
): CleanedFileCategory {
  if (decision === 'duplicate') return 'bestätigtes-duplikat'
  if (decision === 'later') return 'ungeklärt'
  if (decision === 'unreviewed' && candidateIds.has(image.id) && !referenceIds.has(image.id)) return 'ungeklärt'
  return 'behalten'
}

function aggregateFileDecision(fileDecision: Decision, relationDecisions: readonly Decision[]): Decision {
  if (fileDecision === 'duplicate' || relationDecisions.includes('duplicate')) return 'duplicate'
  if (fileDecision === 'later' || relationDecisions.includes('later')) return 'later'
  if (relationDecisions.length > 0 && relationDecisions.every((decision) => decision === 'different')) return 'different'
  if (fileDecision === 'different') return 'different'
  return relationDecisions.length > 0 ? 'unreviewed' : fileDecision
}

function compareImagesByPath(first: ImageFeatureRecord, second: ImageFeatureRecord): number {
  return first.path.localeCompare(second.path, 'de-DE', { numeric: true, sensitivity: 'base' })
}
