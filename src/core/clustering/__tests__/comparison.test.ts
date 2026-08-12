import { describe, expect, it } from 'vitest'
import type { CandidateEdge, DuplicateGroup } from '../../types'
import {
  candidateHasStrongMetadataConflict,
  effectiveCandidateRotationDegrees,
  resolveComparisonDecision,
  resolveGroupComparison,
  rotatedImageFitScale,
  safeBulkCandidateIds,
} from '../comparison'

function edge(sourceId: string, targetId: string, score: number, strong = false): CandidateEdge {
  return {
    id: `${sourceId}::${targetId}`,
    sourceId,
    targetId,
    score,
    strong,
    confidence: strong ? 'high' : 'medium',
    category: strong ? 'probable-duplicate' : 'needs-review',
    reasons: [],
    metrics: {},
    metadata: { status: 'neutral', reasons: [] },
  }
}

const group: DuplicateGroup = {
  id: 'group-1',
  referenceId: 'a',
  memberIds: ['a', 'b'],
  uncertainIds: ['c'],
  edgeIds: ['a::b', 'b::c', 'a::c'],
  status: 'unreviewed',
}

describe('resolveGroupComparison', () => {
  it('uses the strongest concrete edge even when a weaker direct reference edge exists', () => {
    const edges = new Map([
      ['a::b', edge('a', 'b', 96, true)],
      ['b::c', edge('b', 'c', 82)],
      ['a::c', edge('a', 'c', 70)],
    ])
    expect(resolveGroupComparison(group, 'c', edges)).toMatchObject({
      baseImageId: 'b',
      directToReference: false,
      edge: { id: 'b::c' },
      presentationTier: 'manual-review',
    })
  })

  it('reports the actual non-reference base when no direct edge exists', () => {
    const edges = new Map([
      ['a::b', edge('a', 'b', 96, true)],
      ['b::c', edge('b', 'c', 82)],
    ])
    expect(resolveGroupComparison(group, 'c', edges)).toMatchObject({
      baseImageId: 'b',
      directToReference: false,
      edge: { id: 'b::c' },
    })
  })

  it('moves a weak metadata conflict to low priority', () => {
    const conflict = edge('a', 'c', 70)
    conflict.metadata = { status: 'conflicts', reasons: ['GPS widerspricht.'] }
    expect(resolveGroupComparison(group, 'c', new Map([[conflict.id, conflict]])))
      .toMatchObject({ presentationTier: 'low-priority' })
  })

  it('never includes uncertain or metadata-conflicting candidates in bulk decisions', () => {
    const safe = edge('a', 'b', 96, true)
    const conflictingStrong = edge('a', 'd', 95, true)
    conflictingStrong.metadata = { status: 'conflicts', reasons: ['Zeit widerspricht.'] }
    const expandedGroup = { ...group, memberIds: ['a', 'b', 'd'] }
    const edges = new Map([
      [safe.id, safe],
      [conflictingStrong.id, conflictingStrong],
      ['b::c', edge('b', 'c', 82, false)],
    ])
    expect(safeBulkCandidateIds(expandedGroup, edges)).toEqual(['b'])
  })

  it('rejects a candidate when any strong core relation conflicts, even if another edge scores higher', () => {
    const neutralBest = edge('b', 'd', 99, true)
    const conflictingReference = edge('a', 'd', 95, true)
    conflictingReference.metadata = { status: 'conflicts', reasons: ['GPS widerspricht.'] }
    const expandedGroup: DuplicateGroup = {
      ...group,
      memberIds: ['a', 'b', 'd'],
      uncertainIds: [],
      edgeIds: ['a::b', neutralBest.id, conflictingReference.id],
    }
    const edges = new Map([
      ['a::b', edge('a', 'b', 96, true)],
      [neutralBest.id, neutralBest],
      [conflictingReference.id, conflictingReference],
    ])

    expect(resolveGroupComparison(expandedGroup, 'd', edges).edge?.id).toBe(neutralBest.id)
    expect(candidateHasStrongMetadataConflict(expandedGroup, 'd', edges)).toBe(true)
    expect(safeBulkCandidateIds(expandedGroup, edges)).toEqual(['b'])
  })
})

describe('effectiveCandidateRotationDegrees', () => {
  it.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
  ] as const)('keeps target rotation %i° as %i°', (stored, expected) => {
    const candidateEdge = edge('base', 'candidate', 90)
    candidateEdge.metrics.alignmentRotationDegrees = stored
    expect(effectiveCandidateRotationDegrees(candidateEdge, 'candidate')).toBe(expected)
  })

  it.each([
    [0, 0],
    [90, 270],
    [180, 180],
    [270, 90],
  ] as const)('inverts source rotation %i° to %i°', (stored, expected) => {
    const reversedEdge = edge('candidate', 'base', 90)
    reversedEdge.metrics.alignmentRotationDegrees = stored
    expect(effectiveCandidateRotationDegrees(reversedEdge, 'candidate')).toBe(expected)
  })

  it('returns zero for a missing or unrelated edge', () => {
    expect(effectiveCandidateRotationDegrees(undefined, 'candidate')).toBe(0)
    expect(effectiveCandidateRotationDegrees(edge('a', 'b', 90), 'candidate')).toBe(0)
  })
})

describe('resolveComparisonDecision', () => {
  it('keeps decisions isolated per concrete review edge', () => {
    const first = { edge: edge('a', 'shared', 72), candidateKind: 'manual-review' as const }
    const second = { edge: edge('c', 'shared', 71), candidateKind: 'manual-review' as const }
    const decisions = { [first.edge.id]: 'different' as const }

    expect(resolveComparisonDecision(first, decisions)).toBe('different')
    expect(resolveComparisonDecision(second, decisions)).toBe('unreviewed')
  })

  it('uses a legacy file decision only for strong members', () => {
    const candidateEdge = edge('a', 'b', 96, true)
    expect(resolveComparisonDecision({ edge: candidateEdge, candidateKind: 'strong-member' }, undefined, 'duplicate')).toBe('duplicate')
    expect(resolveComparisonDecision({ edge: candidateEdge, candidateKind: 'manual-review' }, undefined, 'duplicate')).toBe('unreviewed')
  })
})

describe('rotatedImageFitScale', () => {
  it('makes reciprocal 4:3 and 3:4 images fill the same aligned frame', () => {
    expect(rotatedImageFitScale(4 / 3, 3 / 4, 90)).toBeCloseTo(4 / 3)
    expect(rotatedImageFitScale(4 / 3, 3 / 4, 270)).toBeCloseTo(4 / 3)
  })

  it('does not change unrotated images', () => {
    expect(rotatedImageFitScale(4 / 3, 3 / 4, 0)).toBe(1)
    expect(rotatedImageFitScale(4 / 3, 3 / 4, 180)).toBe(1)
  })
})
