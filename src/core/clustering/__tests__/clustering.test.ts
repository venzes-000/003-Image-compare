import { describe, expect, it } from 'vitest'
import type { CandidateEdge, SimilarityCategory } from '../../types'
import { createDuplicateGroups, UnionFind } from '..'

function candidate(
  sourceId: string,
  targetId: string,
  score: number,
  strong: boolean,
  category: SimilarityCategory = strong ? 'almost-certain-duplicate' : 'needs-review',
): CandidateEdge {
  return {
    id: `${sourceId}-${targetId}`,
    sourceId,
    targetId,
    strong,
    score,
    confidence: strong ? 'very-high' : 'medium',
    category,
    reasons: [],
    metrics: {},
  }
}

const images = ['a', 'b', 'c', 'd'].map((id) => ({ id }))

describe('UnionFind', () => {
  it('unions values, compresses paths and exposes deterministic groups', () => {
    const unionFind = new UnionFind(['c', 'a', 'b', 'd'])
    expect(unionFind.union('a', 'b')).toBe(true)
    expect(unionFind.union('b', 'c')).toBe(true)
    expect(unionFind.union('a', 'c')).toBe(false)
    expect(unionFind.connected('a', 'c')).toBe(true)
    expect(unionFind.connected('a', 'd')).toBe(false)
    expect(unionFind.groups()).toEqual([['a', 'b', 'c'], ['d']])
  })

  it('rejects unknown values', () => {
    expect(() => new UnionFind(['a']).find('missing')).toThrow(/Unknown UnionFind value/)
  })
})

describe('createDuplicateGroups', () => {
  it('forms a strong core only when all pairwise strong edges exist', () => {
    const groups = createDuplicateGroups(
      [candidate('a', 'b', 97, true), candidate('a', 'c', 96, true), candidate('b', 'c', 95, true)],
      images,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      referenceId: 'a',
      memberIds: ['a', 'b', 'c'],
      uncertainIds: [],
      status: 'unreviewed',
    })
  })

  it('prevents A-B-C chain formation and preserves the bridging edge as a review pair', () => {
    const groups = createDuplicateGroups(
      [candidate('a', 'b', 97, true), candidate('b', 'c', 96, true)],
      images,
    )
    expect(groups).toHaveLength(2)
    expect(groups[0]?.memberIds).toEqual(['a', 'b'])
    expect(groups[0]?.uncertainIds).toEqual([])
    expect(groups[1]?.memberIds).toHaveLength(1)
    expect(groups[1]?.uncertainIds).toHaveLength(1)
    expect(groups[1]?.edgeIds).toEqual(['b-c'])
  })

  it('represents every edge of a weak chain as a separate review pair', () => {
    const groups = createDuplicateGroups(
      [candidate('a', 'b', 72, false), candidate('b', 'c', 74, false)],
      images,
    )
    expect(groups).toHaveLength(2)
    expect(groups.flatMap((group) => group.edgeIds).sort()).toEqual(['a-b', 'b-c'])
    expect(groups.every((group) => group.memberIds.length === 1 && group.uncertainIds.length === 1)).toBe(true)
  })

  it('preserves a secondary review relation without adding it to a strong core', () => {
    const groups = createDuplicateGroups(
      [
        candidate('a', 'b', 96, true),
        candidate('b', 'c', 76, false),
        candidate('c', 'd', 74, false),
      ],
      images,
    )
    expect(groups).toHaveLength(3)
    expect(groups.find((group) => group.memberIds.length > 1)).toMatchObject({ memberIds: ['a', 'b'], uncertainIds: [] })
    expect(groups.flatMap((group) => group.edgeIds).sort()).toEqual(['a-b', 'b-c', 'c-d'])
  })

  it('represents every retained relation exactly once', () => {
    const groups = createDuplicateGroups(
      [
        candidate('a', 'b', 96, true),
        candidate('b', 'c', 76, false),
        candidate('c', 'd', 74, false),
      ],
      images,
    )
    const edgeIds = groups.flatMap((group) => group.edgeIds)
    expect(edgeIds.sort()).toEqual(['a-b', 'b-c', 'c-d'])
    expect(new Set(edgeIds).size).toBe(edgeIds.length)
  })

  it('ignores probably-different and malformed edges', () => {
    const groups = createDuplicateGroups(
      [
        candidate('a', 'b', 30, false, 'probably-different'),
        candidate('a', 'missing', 99, true),
        candidate('c', 'c', 99, true),
      ],
      images,
    )
    expect(groups).toEqual([])
  })

  it('is deterministic for reversed input order and duplicate pair directions', () => {
    const forward = [
      candidate('a', 'b', 95, true),
      candidate('b', 'a', 92, false),
      candidate('a', 'c', 94, true),
      candidate('b', 'c', 93, true),
    ]
    expect(createDuplicateGroups(forward, images)).toEqual(
      createDuplicateGroups([...forward].reverse(), [...images].reverse()),
    )
  })
})
