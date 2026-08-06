/// <reference lib="webworker" />

import { hammingDistance } from '../core/hashing'
import {
  calculateGlobalSsim,
  calculateSimilarityAssessment,
  compareHistograms,
} from '../core/similarity'
import type { CandidateEdge, ImageFeatureRecord } from '../core/types'
import type { CandidateWorkerRequest, CandidateWorkerResponse } from './workerProtocol'

declare const self: DedicatedWorkerGlobalScope

interface RankedPair {
  sourceIndex: number
  targetIndex: number
  rank: number
  aHashDistance: number
  dHashDistance: number
  pHashDistance: number
  aspectRatioDifference: number
}

let paused = false
let cancelled = false

function respond(message: CandidateWorkerResponse): void {
  self.postMessage(message)
}

function insertRankedPair(bucket: RankedPair[], pair: RankedPair, limit: number): void {
  bucket.push(pair)
  if (bucket.length <= limit) return
  let worstIndex = 0
  for (let index = 1; index < bucket.length; index += 1) {
    if ((bucket[index]?.rank ?? 0) > (bucket[worstIndex]?.rank ?? 0)) worstIndex = index
  }
  bucket.splice(worstIndex, 1)
}

async function checkpoint(): Promise<boolean> {
  while (paused && !cancelled) {
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  return !cancelled
}

function shouldConsiderPair(
  a: ImageFeatureRecord,
  b: ImageFeatureRecord,
  distances: Pick<RankedPair, 'aHashDistance' | 'dHashDistance' | 'pHashDistance' | 'aspectRatioDifference'>,
  thresholds: { a: number; d: number; p: number },
): boolean {
  const closestHash = Math.min(distances.aHashDistance, distances.dHashDistance, distances.pHashDistance)
  const twoHashesAgree =
    Number(distances.aHashDistance <= thresholds.a + 3) +
      Number(distances.dHashDistance <= thresholds.d + 3) +
      Number(distances.pHashDistance <= thresholds.p + 3) >=
    2
  const nearExact = closestHash <= 4
  const aspectCompatible = distances.aspectRatioDifference <= 0.38 || nearExact
  const luminanceCompatible = Math.abs(a.luminanceMean - b.luminanceMean) <= 0.35 || nearExact
  return aspectCompatible && luminanceCompatible && (nearExact || twoHashesAgree)
}

async function searchCandidates(
  images: ImageFeatureRecord[],
  settings: Extract<CandidateWorkerRequest, { type: 'SEARCH_CANDIDATES' }>['payload']['settings'],
): Promise<CandidateEdge[]> {
  const totalPairs = (images.length * (images.length - 1)) / 2
  const topByImage = Array.from({ length: images.length }, () => [] as RankedPair[])
  let processedPairs = 0
  let rawCandidates = 0

  for (let sourceIndex = 0; sourceIndex < images.length; sourceIndex += 1) {
    const source = images[sourceIndex]
    if (!source) continue
    for (let targetIndex = sourceIndex + 1; targetIndex < images.length; targetIndex += 1) {
      const target = images[targetIndex]
      if (!target) continue
      const aHashDistance = hammingDistance(source.aHash, target.aHash)
      const dHashDistance = hammingDistance(source.dHash, target.dHash)
      const pHashDistance = hammingDistance(source.pHash, target.pHash)
      const aspectRatioDifference =
        Math.abs(source.aspectRatio - target.aspectRatio) /
        Math.max(source.aspectRatio, target.aspectRatio, Number.EPSILON)
      const distances = { aHashDistance, dHashDistance, pHashDistance, aspectRatioDifference }

      if (
        shouldConsiderPair(source, target, distances, {
          a: settings.aHashThreshold,
          d: settings.dHashThreshold,
          p: settings.pHashThreshold,
        })
      ) {
        rawCandidates += 1
        const rank =
          pHashDistance * 0.5 +
          dHashDistance * 0.3 +
          aHashDistance * 0.2 +
          aspectRatioDifference * 20 +
          Math.abs(source.luminanceMean - target.luminanceMean) * 10
        const pair: RankedPair = { sourceIndex, targetIndex, rank, ...distances }
        insertRankedPair(topByImage[sourceIndex] ?? [], pair, settings.candidateLimitPerImage)
        insertRankedPair(topByImage[targetIndex] ?? [], pair, settings.candidateLimitPerImage)
      }

      processedPairs += 1
      if (processedPairs % 16_384 === 0) {
        respond({
          type: 'PROGRESS',
          payload: {
            stage: 'searching-candidates',
            processed: processedPairs,
            total: totalPairs,
            candidates: rawCandidates,
          },
        })
        if (!(await checkpoint())) return []
      }
    }
  }

  const uniquePairs = new Map<string, RankedPair>()
  for (const bucket of topByImage) {
    for (const pair of bucket) uniquePairs.set(`${pair.sourceIndex}:${pair.targetIndex}`, pair)
  }
  const rankedPairs = [...uniquePairs.values()].sort((left, right) => left.rank - right.rank)
  const edges: CandidateEdge[] = []

  for (let index = 0; index < rankedPairs.length; index += 1) {
    const pair = rankedPairs[index]
    if (!pair) continue
    const source = images[pair.sourceIndex]
    const target = images[pair.targetIndex]
    if (!source || !target) continue
    const ssim = calculateGlobalSsim(source.gray, target.gray)
    const histogramSimilarity = compareHistograms(source.histogram, target.histogram)
    const resolutionRatio = Math.min(source.width * source.height, target.width * target.height) /
      Math.max(1, Math.max(source.width * source.height, target.width * target.height))
    const assessment = calculateSimilarityAssessment(
      {
        aHashDistance: pair.aHashDistance,
        dHashDistance: pair.dHashDistance,
        pHashDistance: pair.pHashDistance,
        ssim,
        histogramSimilarity,
        aspectRatioDifference: pair.aspectRatioDifference,
        resolutionRatio,
      },
      settings,
    )

    if (assessment.category !== 'probably-different') {
      edges.push({
        id: `${source.id}::${target.id}`,
        sourceId: source.id,
        targetId: target.id,
        strong:
          assessment.category === 'almost-certain-duplicate' ||
          (assessment.category === 'probable-duplicate' && assessment.score >= 84),
        ...assessment,
      })
    }

    if (index % 128 === 0) {
      respond({
        type: 'PROGRESS',
        payload: {
          stage: 'comparing-candidates',
          processed: index + 1,
          total: rankedPairs.length,
          candidates: edges.length,
        },
      })
      if (!(await checkpoint())) return []
    }
  }

  return edges
}

self.onmessage = async (event: MessageEvent<CandidateWorkerRequest>) => {
  if (event.data.type === 'PAUSE') {
    paused = true
    return
  }
  if (event.data.type === 'RESUME') {
    paused = false
    return
  }
  if (event.data.type === 'CANCEL') {
    cancelled = true
    paused = false
    return
  }

  try {
    cancelled = false
    paused = false
    const edges = await searchCandidates(event.data.payload.images, event.data.payload.settings)
    if (!cancelled) respond({ type: 'CANDIDATES_FOUND', payload: { edges } })
  } catch (error) {
    const detail = error instanceof Error ? error.stack : undefined
    respond({
      type: 'ERROR',
      payload: {
        message: error instanceof Error ? error.message : 'Die Kandidatensuche ist fehlgeschlagen.',
        ...(detail ? { detail } : {}),
      },
    })
  }
}

export {}
