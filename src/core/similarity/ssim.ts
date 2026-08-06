const SSIM_EDGE = 64
const SSIM_PIXEL_COUNT = SSIM_EDGE * SSIM_EDGE
const LUMINANCE_RANGE = 255
const C1 = (0.01 * LUMINANCE_RANGE) ** 2
const C2 = (0.03 * LUMINANCE_RANGE) ** 2

/** Global SSIM over the normalized 64 x 64 luminance images kept by the pipeline. */
export function calculateGlobalSsim(grayA: Uint8Array, grayB: Uint8Array): number {
  if (grayA.length !== SSIM_PIXEL_COUNT || grayB.length !== SSIM_PIXEL_COUNT) {
    throw new RangeError(`Global SSIM expects two ${SSIM_EDGE} x ${SSIM_EDGE} grayscale images.`)
  }

  let sumA = 0
  let sumB = 0
  let identical = true
  for (let index = 0; index < SSIM_PIXEL_COUNT; index += 1) {
    const left = grayA[index] ?? 0
    const right = grayB[index] ?? 0
    sumA += left
    sumB += right
    if (left !== right) identical = false
  }
  if (identical) return 1

  const meanA = sumA / SSIM_PIXEL_COUNT
  const meanB = sumB / SSIM_PIXEL_COUNT
  let squaredDeviationA = 0
  let squaredDeviationB = 0
  let covariance = 0

  for (let index = 0; index < SSIM_PIXEL_COUNT; index += 1) {
    const deviationA = (grayA[index] ?? 0) - meanA
    const deviationB = (grayB[index] ?? 0) - meanB
    squaredDeviationA += deviationA * deviationA
    squaredDeviationB += deviationB * deviationB
    covariance += deviationA * deviationB
  }

  const divisor = SSIM_PIXEL_COUNT - 1
  const varianceA = squaredDeviationA / divisor
  const varianceB = squaredDeviationB / divisor
  const covarianceAB = covariance / divisor
  const numerator = (2 * meanA * meanB + C1) * (2 * covarianceAB + C2)
  const denominator = (meanA * meanA + meanB * meanB + C1) * (varianceA + varianceB + C2)
  if (denominator === 0) return 1
  return Math.max(-1, Math.min(1, numerator / denominator))
}

