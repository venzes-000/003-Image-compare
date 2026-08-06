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

  it('prevents A-B-C chain formation and keeps C uncertain', () => {
    const groups = createDuplicateGroups(
      [candidate('a', 'b', 97, true), candidate('b', 'c', 96, true)],
      images,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]?.memberIds).toEqual(['a', 'b'])
    expect(groups[0]?.uncertainIds).toEqual(['c'])
  })

  it('represents a weak chain as one reference with uncertain neighbors', () => {
    const groups = createDuplicateGroups(
      [candidate('a', 'b', 72, false), candidate('b', 'c', 74, false)],
      images,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]?.referenceId).toBe('b')
    expect(groups[0]?.memberIds).toEqual(['b'])
    expect(groups[0]?.uncertainIds).toEqual(['a', 'c'])
  })

  it('preserves a weak edge that continues from an uncertain core neighbor', () => {
    const groups = createDuplicateGroups(
      [
        candidate('a', 'b', 96, true),
        candidate('b', 'c', 76, false),
        candidate('c', 'd', 74, false),
      ],
      images,
    )
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ memberIds: ['a', 'b'], uncertainIds: ['c'] })
    expect(groups[1]).toMatchObject({ referenceId: 'c', memberIds: ['c'], uncertainIds: ['d'] })
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
