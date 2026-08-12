import type {
  AnalysisSettings,
  SensitivityMode,
  SimilarityAssessment,
  SimilarityCategory,
  SimilarityMetrics,
} from '../types'

interface ModeAssessmentRules {
  label: string
  almostCertainScore: number
  probableScore: number
  reviewScore: number
  reviewSsimFloor: number
  aspectRatioTolerance: number
  featureMinimum: number
  aiMinimum: number
}

export const ASSESSMENT_MODE_RULES: Readonly<Record<SensitivityMode, ModeAssessmentRules>> =
  Object.freeze({
    strict: {
      label: 'Streng',
      almostCertainScore: 93,
      probableScore: 85,
      reviewScore: 68,
      reviewSsimFloor: 0.84,
      aspectRatioTolerance: 0.04,
      featureMinimum: 0.88,
      aiMinimum: 0.92,
    },
    balanced: {
      label: 'Ausgeglichen',
      almostCertainScore: 89,
      probableScore: 78,
      reviewScore: 60,
      reviewSsimFloor: 0.76,
      aspectRatioTolerance: 0.1,
      featureMinimum: 0.78,
      aiMinimum: 0.86,
    },
    sensitive: {
      label: 'Sensitiv',
      almostCertainScore: 84,
      probableScore: 68,
      reviewScore: 50,
      reviewSsimFloor: 0.64,
      aspectRatioTolerance: 0.2,
      featureMinimum: 0.68,
      aiMinimum: 0.78,
    },
  })

export const SIMILARITY_WEIGHTS = Object.freeze({
  pHash: 0.28,
  dHash: 0.14,
  aHash: 0.08,
  ssim: 0.3,
  histogram: 0.1,
  featureMatch: 0.12,
  ai: 0.08,
  aspectRatio: 0.04,
  resolution: 0.02,
})

interface WeightedEvidence {
  similarity: number
  weight: number
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function assertFiniteInRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}.`)
  }
}

export interface CandidateGateMetrics {
  aHashDistance: number
  dHashDistance: number
  pHashDistance: number
  aspectRatioDifference: number
  luminanceDifference: number
}

/**
 * Cheap high-recall gate used before SSIM. The caller supplies distances from
 * the best quarter-turn alignment, so EXIF/display rotation cannot discard an
 * otherwise identical pair.
 */
export function isPlausibleVisualCandidate(
  metrics: CandidateGateMetrics,
  thresholds: Pick<AnalysisSettings, 'aHashThreshold' | 'dHashThreshold' | 'pHashThreshold'>,
): boolean {
  for (const [name, value] of Object.entries(metrics)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a finite, non-negative number.`)
    }
  }
  const closestHash = Math.min(
    metrics.aHashDistance,
    metrics.dHashDistance,
    metrics.pHashDistance,
  )
  const twoHashesAgree =
    Number(metrics.aHashDistance <= thresholds.aHashThreshold + 3) +
      Number(metrics.dHashDistance <= thresholds.dHashThreshold + 3) +
      Number(metrics.pHashDistance <= thresholds.pHashThreshold + 3) >=
    2
  const nearExact = closestHash <= 4
  const aspectCompatible = metrics.aspectRatioDifference <= 0.38 || nearExact
  const luminanceCompatible = metrics.luminanceDifference <= 0.35 || nearExact
  return aspectCompatible && luminanceCompatible && (nearExact || twoHashesAgree)
}

/**
 * Candidates from an old cache have no quarter-turn hash variants. Give
 * portrait/landscape swaps one narrow rescue path so a rotated near-duplicate
 * can still reach SSIM without reopening the archive.
 */
export function isPlausibleLegacyQuarterTurnCandidate(
  metrics: CandidateGateMetrics,
  sourceAspectRatio: number,
  targetAspectRatio: number,
): boolean {
  const reciprocalAspectDifference = Math.abs(sourceAspectRatio - 1 / targetAspectRatio) /
    Math.max(sourceAspectRatio, 1 / targetAspectRatio, Number.EPSILON)
  if (reciprocalAspectDifference > 0.08 || metrics.luminanceDifference > 0.08) return false
  const closestHash = Math.min(
    metrics.aHashDistance,
    metrics.dHashDistance,
    metrics.pHashDistance,
  )
  const meanHashDistance =
    (metrics.aHashDistance + metrics.dHashDistance + metrics.pHashDistance) / 3
  return closestHash <= 32 && meanHashDistance <= 38
}

function addHashEvidence(
  evidence: WeightedEvidence[],
  distance: number | undefined,
  weight: number,
  name: string,
): void {
  if (distance === undefined) return
  assertFiniteInRange(distance, 0, 64, name)
  evidence.push({ similarity: 1 - distance / 64, weight })
}

function addUnitEvidence(
  evidence: WeightedEvidence[],
  value: number | undefined,
  weight: number,
  name: string,
): void {
  if (value === undefined) return
  assertFiniteInRange(value, 0, 1, name)
  evidence.push({ similarity: value, weight })
}

function formatDecimal(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

function countDefinedMetrics(metrics: SimilarityMetrics): number {
  return [
    metrics.aHashDistance,
    metrics.dHashDistance,
    metrics.pHashDistance,
    metrics.ssim,
    metrics.histogramSimilarity,
    metrics.featureMatchScore,
    metrics.aiSimilarity,
  ].filter((value) => value !== undefined).length
}

export function calculateSimilarityAssessment(
  metrics: SimilarityMetrics,
  settings: AnalysisSettings,
): SimilarityAssessment {
  const rules = ASSESSMENT_MODE_RULES[settings.mode]
  const evidence: WeightedEvidence[] = []
  addHashEvidence(evidence, metrics.pHashDistance, SIMILARITY_WEIGHTS.pHash, 'pHash distance')
  addHashEvidence(evidence, metrics.dHashDistance, SIMILARITY_WEIGHTS.dHash, 'dHash distance')
  addHashEvidence(evidence, metrics.aHashDistance, SIMILARITY_WEIGHTS.aHash, 'aHash distance')

  if (metrics.ssim !== undefined) {
    assertFiniteInRange(metrics.ssim, -1, 1, 'SSIM')
    evidence.push({ similarity: clamp01(metrics.ssim), weight: SIMILARITY_WEIGHTS.ssim })
  }
  addUnitEvidence(
    evidence,
    metrics.histogramSimilarity,
    SIMILARITY_WEIGHTS.histogram,
    'Histogram similarity',
  )
  addUnitEvidence(
    evidence,
    metrics.featureMatchScore,
    SIMILARITY_WEIGHTS.featureMatch,
    'Feature match score',
  )
  addUnitEvidence(evidence, metrics.aiSimilarity, SIMILARITY_WEIGHTS.ai, 'AI similarity')

  if (metrics.aspectRatioDifference !== undefined) {
    if (!Number.isFinite(metrics.aspectRatioDifference) || metrics.aspectRatioDifference < 0) {
      throw new RangeError('Aspect-ratio difference must be a finite, non-negative number.')
    }
    evidence.push({
      similarity: Math.exp(-4 * metrics.aspectRatioDifference),
      weight: SIMILARITY_WEIGHTS.aspectRatio,
    })
  }
  if (metrics.resolutionRatio !== undefined) {
    if (!Number.isFinite(metrics.resolutionRatio) || metrics.resolutionRatio < 0) {
      throw new RangeError('Resolution ratio must be a finite, non-negative number.')
    }
    const normalizedRatio =
      metrics.resolutionRatio > 1 ? 1 / metrics.resolutionRatio : metrics.resolutionRatio
    evidence.push({ similarity: normalizedRatio, weight: SIMILARITY_WEIGHTS.resolution })
  }

  let weightedTotal = 0
  let totalWeight = 0
  for (const item of evidence) {
    weightedTotal += item.similarity * item.weight
    totalWeight += item.weight
  }
  let score = totalWeight === 0 ? 0 : Math.round((weightedTotal / totalWeight) * 100)

  const aspectConflict =
    metrics.aspectRatioDifference !== undefined &&
    metrics.aspectRatioDifference > rules.aspectRatioTolerance
  if (aspectConflict) {
    const excess = (metrics.aspectRatioDifference ?? 0) - rules.aspectRatioTolerance
    score = Math.round(score * Math.max(0.72, 1 - excess * 0.55))
  }
  score = Math.max(0, Math.min(100, score))

  const passingHashCount =
    Number(
      metrics.pHashDistance !== undefined && metrics.pHashDistance <= settings.pHashThreshold,
    ) +
    Number(
      metrics.dHashDistance !== undefined && metrics.dHashDistance <= settings.dHashThreshold,
    ) +
    Number(metrics.aHashDistance !== undefined && metrics.aHashDistance <= settings.aHashThreshold)
  const hashSupport = passingHashCount > 0
  const ssimSupport = metrics.ssim !== undefined && metrics.ssim >= settings.minimumSsim
  const histogramSupport =
    metrics.histogramSimilarity !== undefined &&
    metrics.histogramSimilarity >= settings.minimumHistogramSimilarity
  const featureSupport =
    metrics.featureMatchScore !== undefined && metrics.featureMatchScore >= rules.featureMinimum
  const aiSupport = metrics.aiSimilarity !== undefined && metrics.aiSimilarity >= rules.aiMinimum
  const supportFamilies =
    Number(hashSupport) +
    Number(ssimSupport) +
    Number(histogramSupport) +
    Number(featureSupport) +
    Number(aiSupport)
  const hashConsensus = passingHashCount >= 2
  const structuralReviewSupport =
    metrics.ssim !== undefined && metrics.ssim >= rules.reviewSsimFloor
  const reviewSupport =
    (structuralReviewSupport && (hashConsensus || histogramSupport)) ||
    (featureSupport && (hashSupport || ssimSupport || histogramSupport)) ||
    (aiSupport && (hashSupport || ssimSupport || histogramSupport || featureSupport))

  let category: SimilarityCategory
  if (
    score >= rules.almostCertainScore &&
    supportFamilies >= 3 &&
    (hashSupport || ssimSupport || featureSupport)
  ) {
    category = 'almost-certain-duplicate'
  } else if (score >= rules.probableScore && supportFamilies >= 2) {
    category = 'probable-duplicate'
  } else if (score >= rules.reviewScore && reviewSupport) {
    category = 'needs-review'
  } else {
    category = 'probably-different'
  }

  const metricCount = countDefinedMetrics(metrics)
  let confidence: SimilarityAssessment['confidence']
  if (category === 'almost-certain-duplicate' && supportFamilies >= 3 && metricCount >= 4) {
    confidence = 'very-high'
  } else if (
    (category === 'almost-certain-duplicate' || category === 'probable-duplicate') &&
    supportFamilies >= 2 &&
    metricCount >= 3
  ) {
    confidence = 'high'
  } else if (category === 'needs-review' && metricCount >= 2) {
    confidence = 'medium'
  } else {
    confidence = 'low'
  }

  const reasons: string[] = []
  if (metrics.pHashDistance !== undefined) {
    reasons.push(
      `pHash-Abstand ${metrics.pHashDistance}/64 ${
        metrics.pHashDistance <= settings.pHashThreshold
          ? `liegt im Grenzwert (≤ ${settings.pHashThreshold})`
          : `überschreitet den Grenzwert (${settings.pHashThreshold})`
      }.`,
    )
  }
  if (passingHashCount >= 2) {
    reasons.push(`${passingHashCount} unabhängige Bild-Hashes stimmen ausreichend überein.`)
  }
  if (metrics.ssim !== undefined) {
    reasons.push(
      `SSIM ${formatDecimal(metrics.ssim)} ${
        ssimSupport ? 'bestätigt eine ähnliche Bildstruktur' : 'liefert keine starke Strukturbestätigung'
      } (Grenzwert ${formatDecimal(settings.minimumSsim)}).`,
    )
  }
  if (metrics.histogramSimilarity !== undefined) {
    reasons.push(
      `Histogramm-Ähnlichkeit ${formatDecimal(metrics.histogramSimilarity)} ${
        histogramSupport ? 'stützt den Treffer' : 'liegt unter dem Modus-Grenzwert'
      } (Grenzwert ${formatDecimal(settings.minimumHistogramSimilarity)}).`,
    )
  }
  if (aspectConflict) {
    reasons.push('Die Seitenverhältnisse unterscheiden sich deutlich; der Gesamtwert wurde reduziert.')
  } else if (metrics.aspectRatioDifference !== undefined) {
    reasons.push('Die Seitenverhältnisse sind mit dem gewählten Modus vereinbar.')
  }
  if (metrics.featureMatchScore !== undefined) {
    reasons.push(
      `Lokaler Merkmalsabgleich: ${formatDecimal(metrics.featureMatchScore)} (${featureSupport ? 'stützend' : 'nicht bestätigend'}).`,
    )
  }
  if (metrics.aiSimilarity !== undefined) {
    reasons.push(
      `Optionale lokale KI-Ähnlichkeit: ${formatDecimal(metrics.aiSimilarity)} (${aiSupport ? 'stützend' : 'nicht bestätigend'}).`,
    )
  }
  reasons.push(
    `${rules.label}-Modus: technische Einstufung ab ${rules.reviewScore}/${rules.probableScore}/${rules.almostCertainScore} Punkten.`,
  )

  return {
    score,
    confidence,
    category,
    reasons,
    metrics: { ...metrics },
  }
}
