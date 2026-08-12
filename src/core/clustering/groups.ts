import type { CandidateEdge, DuplicateGroup, ImageFeatureRecord } from '../types'
import { UnionFind } from './unionFind'

export type ClusteringImage = Pick<ImageFeatureRecord, 'id'> &
  Partial<Pick<ImageFeatureRecord, 'width' | 'height' | 'size'>>

interface GroupDraft {
  coreIds: string[]
  uncertainIds: string[]
  edgeIds: string[]
  referenceId: string
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalPair(left: string, right: string): string {
  return JSON.stringify(compareText(left, right) <= 0 ? [left, right] : [right, left])
}

function categoryRank(edge: CandidateEdge): number {
  switch (edge.category) {
    case 'almost-certain-duplicate':
      return 4
    case 'probable-duplicate':
      return 3
    case 'needs-review':
      return 2
    case 'probably-different':
      return 1
  }
}

function compareEdgeStrength(left: CandidateEdge, right: CandidateEdge): number {
  if (left.strong !== right.strong) return left.strong ? -1 : 1
  if (left.score !== right.score) return right.score - left.score
  const categoryDifference = categoryRank(right) - categoryRank(left)
  if (categoryDifference !== 0) return categoryDifference
  return compareText(left.id, right.id)
}

function chooseBestEdges(
  edges: readonly CandidateEdge[],
  knownImageIds: ReadonlySet<string>,
): CandidateEdge[] {
  const byPair = new Map<string, CandidateEdge>()
  for (const edge of edges) {
    if (
      edge.sourceId === edge.targetId ||
      !knownImageIds.has(edge.sourceId) ||
      !knownImageIds.has(edge.targetId)
    ) {
      continue
    }
    const key = canonicalPair(edge.sourceId, edge.targetId)
    const current = byPair.get(key)
    if (!current || compareEdgeStrength(edge, current) < 0) byPair.set(key, edge)
  }
  return [...byPair.values()].sort(compareEdgeStrength)
}

function canMergeCompleteLink(
  left: readonly string[],
  right: readonly string[],
  strongPairs: ReadonlySet<string>,
): boolean {
  for (const leftId of left) {
    for (const rightId of right) {
      if (!strongPairs.has(canonicalPair(leftId, rightId))) return false
    }
  }
  return true
}

function selectReference(
  candidates: readonly string[],
  imagesById: ReadonlyMap<string, ClusteringImage>,
  relevantEdges: readonly CandidateEdge[],
): string {
  const scores = new Map<string, number>()
  for (const candidate of candidates) scores.set(candidate, 0)
  for (const edge of relevantEdges) {
    if (scores.has(edge.sourceId)) scores.set(edge.sourceId, (scores.get(edge.sourceId) ?? 0) + edge.score)
    if (scores.has(edge.targetId)) scores.set(edge.targetId, (scores.get(edge.targetId) ?? 0) + edge.score)
  }

  const sorted = [...candidates].sort((left, right) => {
    const scoreDifference = (scores.get(right) ?? 0) - (scores.get(left) ?? 0)
    if (scoreDifference !== 0) return scoreDifference
    const leftImage = imagesById.get(left)
    const rightImage = imagesById.get(right)
    const leftPixels = (leftImage?.width ?? 0) * (leftImage?.height ?? 0)
    const rightPixels = (rightImage?.width ?? 0) * (rightImage?.height ?? 0)
    if (leftPixels !== rightPixels) return rightPixels - leftPixels
    const sizeDifference = (rightImage?.size ?? 0) - (leftImage?.size ?? 0)
    if (sizeDifference !== 0) return sizeDifference
    return compareText(left, right)
  })
  const reference = sorted[0]
  if (reference === undefined) throw new Error('Cannot select a reference from an empty group.')
  return reference
}

function edgesInside(
  edges: readonly CandidateEdge[],
  coreIds: ReadonlySet<string>,
  uncertainIds: ReadonlySet<string>,
): CandidateEdge[] {
  return edges.filter((edge) => {
    const sourceCore = coreIds.has(edge.sourceId)
    const targetCore = coreIds.has(edge.targetId)
    return (
      (sourceCore && targetCore) ||
      (sourceCore && uncertainIds.has(edge.targetId)) ||
      (targetCore && uncertainIds.has(edge.sourceId))
    )
  })
}

/**
 * Creates complete-link core groups. A strong A-B plus B-C chain is therefore not
 * promoted to a three-image duplicate core unless A-C is also a strong edge.
 */
export function createDuplicateGroups(
  edges: readonly CandidateEdge[],
  images: readonly ClusteringImage[],
): DuplicateGroup[] {
  const imagesById = new Map<string, ClusteringImage>()
  for (const image of images) {
    if (!imagesById.has(image.id)) imagesById.set(image.id, image)
  }
  const imageIds = [...imagesById.keys()].sort(compareText)
  const knownImageIds = new Set(imageIds)
  const normalizedEdges = chooseBestEdges(edges, knownImageIds)
  const relevantEdges = normalizedEdges.filter((edge) => edge.category !== 'probably-different')
  if (relevantEdges.length === 0) return []

  const strongEdges = relevantEdges.filter((edge) => edge.strong).sort(compareEdgeStrength)
  const strongPairs = new Set(strongEdges.map((edge) => canonicalPair(edge.sourceId, edge.targetId)))
  const unionFind = new UnionFind(imageIds)
  const membersByRoot = new Map(imageIds.map((imageId) => [imageId, [imageId]]))

  for (const edge of strongEdges) {
    const sourceRoot = unionFind.find(edge.sourceId)
    const targetRoot = unionFind.find(edge.targetId)
    if (sourceRoot === targetRoot) continue
    const sourceMembers = membersByRoot.get(sourceRoot) ?? [edge.sourceId]
    const targetMembers = membersByRoot.get(targetRoot) ?? [edge.targetId]
    if (canMergeCompleteLink(sourceMembers, targetMembers, strongPairs)) {
      unionFind.union(sourceRoot, targetRoot)
      const mergedRoot = unionFind.find(sourceRoot)
      membersByRoot.delete(sourceRoot)
      membersByRoot.delete(targetRoot)
      membersByRoot.set(mergedRoot, [...sourceMembers, ...targetMembers].sort(compareText))
    }
  }

  const drafts: GroupDraft[] = []
  const strongComponents = unionFind.groups().filter((component) => component.length >= 2)
  for (const component of strongComponents) {
    const coreSet = new Set(component)
    const componentEdges = relevantEdges.filter(
      (edge) => coreSet.has(edge.sourceId) && coreSet.has(edge.targetId),
    )
    const referenceId = selectReference(component, imagesById, componentEdges)
    drafts.push({
      coreIds: [...component],
      uncertainIds: [],
      edgeIds: componentEdges.map((edge) => edge.id),
      referenceId,
    })
  }

  // Every relation that is not already represented inside a complete-link
  // duplicate core becomes its own review pair. This keeps primary duplicate
  // groups unambiguous while ensuring no retained weak/bridging edge silently
  // disappears from the UI or CSV export.
  const representedEdgeIds = new Set(drafts.flatMap((draft) => draft.edgeIds))
  for (const edge of relevantEdges) {
    if (representedEdgeIds.has(edge.id)) continue
    const pairIds = [edge.sourceId, edge.targetId]
    const referenceId = selectReference(pairIds, imagesById, [edge])
    const candidateId = referenceId === edge.sourceId ? edge.targetId : edge.sourceId
    drafts.push({
      coreIds: [referenceId],
      uncertainIds: [candidateId],
      edgeIds: [edge.id],
      referenceId,
    })
  }

  drafts.sort((left, right) => compareText(left.referenceId, right.referenceId))
  return drafts.map((draft, index) => {
    const coreIds = [...new Set(draft.coreIds)].sort(compareText)
    const memberIds = [draft.referenceId, ...coreIds.filter((id) => id !== draft.referenceId)]
    const uncertainIds = [...new Set(draft.uncertainIds)]
      .filter((id) => !memberIds.includes(id))
      .sort(compareText)
    const includedEdges = edgesInside(
      normalizedEdges,
      new Set(memberIds),
      new Set(uncertainIds),
    )
    const allowedEdgeIds = new Set(draft.edgeIds)
    const edgeIds = includedEdges
      .filter((edge) => allowedEdgeIds.has(edge.id))
      .map((edge) => edge.id)
      .sort(compareText)
    return {
      id: `group-${index + 1}`,
      referenceId: draft.referenceId,
      memberIds,
      uncertainIds,
      edgeIds,
      status: 'unreviewed',
    }
  })
}
