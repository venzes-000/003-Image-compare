import type { CandidateEdge, Decision, DuplicateGroup, QuarterTurn } from '../types'

export type GroupCandidateKind = 'strong-member' | 'manual-review'
export type ResultPresentationTier = 'strong' | 'manual-review' | 'low-priority'

export interface ResolvedGroupComparison {
  candidateId: string
  baseImageId: string
  groupReferenceId: string
  edge?: CandidateEdge
  directToReference: boolean
  candidateKind: GroupCandidateKind
  presentationTier: ResultPresentationTier
}

export function resolveComparisonDecision(
  comparison: Pick<ResolvedGroupComparison, 'edge' | 'candidateKind'>,
  decisions: Readonly<Record<string, Decision>> | undefined,
  legacyStrongDecision: Decision = 'unreviewed',
): Decision {
  if (comparison.candidateKind === 'strong-member') return legacyStrongDecision
  if (!comparison.edge) return 'unreviewed'
  return decisions?.[comparison.edge.id] ?? 'unreviewed'
}

export function groupCandidateIds(group: DuplicateGroup): string[] {
  return [...new Set([...group.memberIds, ...group.uncertainIds])]
    .filter((imageId) => imageId !== group.referenceId)
}

/**
 * Returns the clockwise rotation that must be applied to the candidate shown
 * in a comparison. The stored metric always rotates the edge target; when the
 * candidate is the source, the inverse rotation is required.
 */
export function effectiveCandidateRotationDegrees(
  edge: CandidateEdge | undefined,
  candidateId: string,
): QuarterTurn {
  if (!edge || (edge.sourceId !== candidateId && edge.targetId !== candidateId)) return 0
  const storedRotation = edge.metrics.alignmentRotationDegrees ?? 0
  if (edge.targetId === candidateId) return storedRotation
  return ((360 - storedRotation) % 360) as QuarterTurn
}

/** Scale correction for a quarter-turned image inside a reference-aspect frame. */
export function rotatedImageFitScale(
  referenceAspect: number,
  candidateAspect: number,
  rotation: QuarterTurn,
): number {
  if (rotation !== 90 && rotation !== 270) return 1
  if (!Number.isFinite(referenceAspect) || referenceAspect <= 0 || !Number.isFinite(candidateAspect) || candidateAspect <= 0) return 1
  const rawFit = Math.min(referenceAspect / candidateAspect, 1)
  const alignedFit = Math.min(referenceAspect, 1 / candidateAspect)
  return alignedFit / rawFit
}

/**
 * Resolves the exact comparison that is presented to the user. UI and exports
 * deliberately share this function so a displayed score can never silently
 * refer to a different image pair than the exported score.
 */
export function resolveGroupComparison(
  group: DuplicateGroup,
  candidateId: string,
  edges: ReadonlyMap<string, CandidateEdge>,
): ResolvedGroupComparison {
  const candidateKind: GroupCandidateKind = group.uncertainIds.includes(candidateId)
    ? 'manual-review'
    : 'strong-member'
  const groupImageIds = new Set([...group.memberIds, ...group.uncertainIds, group.referenceId])
  const incidentEdges = group.edgeIds
    .map((edgeId) => edges.get(edgeId))
    .filter((edge): edge is CandidateEdge => Boolean(edge))
    .filter((edge) => {
      if (edge.sourceId !== candidateId && edge.targetId !== candidateId) return false
      const otherId = edge.sourceId === candidateId ? edge.targetId : edge.sourceId
      return groupImageIds.has(otherId)
    })
    .sort(compareCandidateEdges)
  // The displayed score must describe the strongest concrete relation that
  // actually brought this candidate into the review set. A weaker direct
  // reference edge must not hide a stronger edge to another core member.
  const edge = incidentEdges[0]
  const baseImageId = edge
    ? edge.sourceId === candidateId ? edge.targetId : edge.sourceId
    : group.referenceId
  const directToReference = baseImageId === group.referenceId
  const presentationTier: ResultPresentationTier = candidateKind === 'strong-member'
    ? 'strong'
    : edge?.metadata?.status === 'conflicts'
      ? 'low-priority'
      : 'manual-review'

  return {
    candidateId,
    baseImageId,
    groupReferenceId: group.referenceId,
    ...(edge ? { edge } : {}),
    directToReference,
    candidateKind,
    presentationTier,
  }
}

export function safeBulkCandidateIds(
  group: DuplicateGroup,
  edges: ReadonlyMap<string, CandidateEdge>,
): string[] {
  const coreImageIds = new Set([...group.memberIds, group.referenceId])
  return group.memberIds
    .filter((imageId) => imageId !== group.referenceId)
    .filter((imageId) => {
      const strongCoreEdges = group.edgeIds
        .map((edgeId) => edges.get(edgeId))
        .filter((edge): edge is CandidateEdge => Boolean(edge))
        .filter((edge) => edge.strong)
        .filter((edge) => edge.sourceId === imageId || edge.targetId === imageId)
        .filter((edge) => coreImageIds.has(edge.sourceId) && coreImageIds.has(edge.targetId))
      return strongCoreEdges.length > 0
        && strongCoreEdges.every((edge) => edge.metadata?.status !== 'conflicts')
    })
}

export function candidateHasStrongMetadataConflict(
  group: DuplicateGroup,
  candidateId: string,
  edges: ReadonlyMap<string, CandidateEdge>,
): boolean {
  const coreImageIds = new Set([...group.memberIds, group.referenceId])
  return group.edgeIds
    .map((edgeId) => edges.get(edgeId))
    .filter((edge): edge is CandidateEdge => Boolean(edge))
    .some((edge) => edge.strong
      && edge.metadata?.status === 'conflicts'
      && (edge.sourceId === candidateId || edge.targetId === candidateId)
      && coreImageIds.has(edge.sourceId)
      && coreImageIds.has(edge.targetId))
}

function compareCandidateEdges(left: CandidateEdge, right: CandidateEdge): number {
  if (left.strong !== right.strong) return left.strong ? -1 : 1
  if (left.score !== right.score) return right.score - left.score
  return left.id.localeCompare(right.id, 'en')
}
