import type { AnalysisResult, Decision, ImageFeatureRecord } from '../types'
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
  for (const group of result.groups) {
    referenceIds.add(group.referenceId)
    for (const imageId of new Set([...group.memberIds, ...group.uncertainIds, group.referenceId])) {
      const groupIds = groupIdsByImage.get(imageId) ?? new Set<string>()
      groupIds.add(group.id)
      groupIdsByImage.set(imageId, groupIds)
      if (imageId !== group.referenceId) candidateIds.add(imageId)
    }
  }

  return [...result.images]
    .sort(compareImagesByPath)
    .map((image) => ({
      category: classifyImage(image, candidateIds, referenceIds),
      path: image.path,
      name: image.name,
      decision: image.decision,
      groupIds: [...(groupIdsByImage.get(image.id) ?? [])].sort(),
    }))
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
  candidateIds: ReadonlySet<string>,
  referenceIds: ReadonlySet<string>,
): CleanedFileCategory {
  if (image.decision === 'duplicate') return 'bestätigtes-duplikat'
  if (image.decision === 'later') return 'ungeklärt'
  if (image.decision === 'unreviewed' && candidateIds.has(image.id) && !referenceIds.has(image.id)) return 'ungeklärt'
  return 'behalten'
}

function compareImagesByPath(first: ImageFeatureRecord, second: ImageFeatureRecord): number {
  return first.path.localeCompare(second.path, 'de-DE', { numeric: true, sensitivity: 'base' })
}
