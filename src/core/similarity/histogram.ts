function assertHistogram(histogram: ArrayLike<number>, name: string): void {
  if (histogram.length === 0) throw new RangeError(`${name} must contain at least one bin.`)
  for (let index = 0; index < histogram.length; index += 1) {
    const value = histogram[index] ?? Number.NaN
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} may only contain finite, non-negative values.`)
    }
  }
}

/**
 * Bhattacharyya coefficient for independently L1-normalized histograms.
 * The result is 1 for equal distributions and 0 for disjoint distributions.
 */
export function compareHistograms(
  histogramA: ArrayLike<number>,
  histogramB: ArrayLike<number>,
): number {
  if (histogramA.length !== histogramB.length) {
    throw new RangeError('Histograms must have the same number of bins.')
  }
  assertHistogram(histogramA, 'The first histogram')
  assertHistogram(histogramB, 'The second histogram')

  let sumA = 0
  let sumB = 0
  for (let index = 0; index < histogramA.length; index += 1) {
    sumA += histogramA[index] ?? 0
    sumB += histogramB[index] ?? 0
  }
  if (sumA === 0 || sumB === 0) return sumA === sumB ? 1 : 0

  let coefficient = 0
  for (let index = 0; index < histogramA.length; index += 1) {
    coefficient += Math.sqrt(((histogramA[index] ?? 0) / sumA) * ((histogramB[index] ?? 0) / sumB))
  }
  return Math.max(0, Math.min(1, coefficient))
}
