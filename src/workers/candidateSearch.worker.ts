/// <reference lib="webworker" />

import { APP_LIMITS } from '../core/config/limits'
import {
  findBestRotationAlignment,
  hasCompleteRotationVariants,
  rotateGrayQuarterTurn,
} from '../core/image/rotationFeatures'
import {
  calculateGlobalSsim,
  calculateSimilarityAssessment,
  compareHistograms,
  assessMetadata,
} from '../core/similarity'
import {
  isPlausibleLegacyQuarterTurnCandidate,
  isPlausibleVisualCandidate,
} from '../core/similarity/assessment'
import type { QuarterTurn } from '../core/types'
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
  targetRotationDegrees: QuarterTurn
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
      const alignment = findBestRotationAlignment(source, target)
      const luminanceDifference = Math.abs(source.luminanceMean - target.luminanceMean)
      let candidateAlignment = alignment
      let isCandidate = isPlausibleVisualCandidate(
        {
          aHashDistance: alignment.aHashDistance,
          dHashDistance: alignment.dHashDistance,
          pHashDistance: alignment.pHashDistance,
          aspectRatioDifference: alignment.aspectRatioDifference,
          luminanceDifference,
        },
        settings,
      )
      if (
        !isCandidate &&
        !hasCompleteRotationVariants(target.rotationVariants) &&
        isPlausibleLegacyQuarterTurnCandidate(
          {
            aHashDistance: alignment.aHashDistance,
            dHashDistance: alignment.dHashDistance,
            pHashDistance: alignment.pHashDistance,
            aspectRatioDifference: alignment.aspectRatioDifference,
            luminanceDifference,
          },
          source.aspectRatio,
          target.aspectRatio,
        )
      ) {
        const targetRotationDegrees: QuarterTurn = target.aspectRatio < source.aspectRatio ? 90 : 270
        const targetAspectRatio = 1 / target.aspectRatio
        candidateAlignment = {
          ...alignment,
          targetRotationDegrees,
          aspectRatioDifference: Math.abs(source.aspectRatio - targetAspectRatio) /
            Math.max(source.aspectRatio, targetAspectRatio, Number.EPSILON),
        }
        isCandidate = true
      }

      if (isCandidate) {
        rawCandidates += 1
        const rank = candidateAlignment.rank + luminanceDifference * 10
        const pair: RankedPair = {
          sourceIndex,
          targetIndex,
          aHashDistance: candidateAlignment.aHashDistance,
          dHashDistance: candidateAlignment.dHashDistance,
          pHashDistance: candidateAlignment.pHashDistance,
          aspectRatioDifference: candidateAlignment.aspectRatioDifference,
          targetRotationDegrees: candidateAlignment.targetRotationDegrees,
          rank,
        }
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
    const alignedTargetGray = pair.targetRotationDegrees === 0
      ? target.gray
      : rotateGrayQuarterTurn(
          target.gray,
          APP_LIMITS.analysisSize,
          APP_LIMITS.analysisSize,
          pair.targetRotationDegrees,
        ).gray
    const ssim = calculateGlobalSsim(source.gray, alignedTargetGray)
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
        alignmentRotationDegrees: pair.targetRotationDegrees,
      },
      settings,
    )
    const metadata = assessMetadata(source.metadata, target.metadata)

    if (assessment.category !== 'probably-different') {
      edges.push({
        id: `${source.id}::${target.id}`,
        sourceId: source.id,
        targetId: target.id,
        strong:
          assessment.category === 'almost-certain-duplicate' ||
          (assessment.category === 'probable-duplicate' && assessment.score >= 84),
        metadata,
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
