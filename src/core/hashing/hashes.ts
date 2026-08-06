import { bigintToHash } from './hash64'

const HASH_EDGE = 8
const PHASH_EDGE = 32
const DCT_COEFFICIENT_EDGE = 8

function assertGrayImage(gray: Uint8Array, width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Image dimensions must be positive safe integers.')
  }
  if (gray.length !== width * height) {
    throw new RangeError(`Expected ${width * height} grayscale values, received ${gray.length}.`)
  }
}

function resizeGray(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Float64Array {
  const result = new Float64Array(targetWidth * targetHeight)
  const xScale = sourceWidth / targetWidth
  const yScale = sourceHeight / targetHeight

  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    const sourceY = Math.max(0, Math.min(sourceHeight - 1, (targetY + 0.5) * yScale - 0.5))
    const y0 = Math.floor(sourceY)
    const y1 = Math.min(sourceHeight - 1, y0 + 1)
    const yWeight = sourceY - y0

    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      const sourceX = Math.max(0, Math.min(sourceWidth - 1, (targetX + 0.5) * xScale - 0.5))
      const x0 = Math.floor(sourceX)
      const x1 = Math.min(sourceWidth - 1, x0 + 1)
      const xWeight = sourceX - x0
      const topLeft = source[y0 * sourceWidth + x0] ?? 0
      const topRight = source[y0 * sourceWidth + x1] ?? 0
      const bottomLeft = source[y1 * sourceWidth + x0] ?? 0
      const bottomRight = source[y1 * sourceWidth + x1] ?? 0
      const top = topLeft + (topRight - topLeft) * xWeight
      const bottom = bottomLeft + (bottomRight - bottomLeft) * xWeight
      result[targetY * targetWidth + targetX] = top + (bottom - top) * yWeight
    }
  }

  return result
}

function bitsToHash(bits: Iterable<boolean>): string {
  let value = 0n
  let count = 0
  for (const bit of bits) {
    value = (value << 1n) | (bit ? 1n : 0n)
    count += 1
  }
  if (count !== 64) throw new RangeError(`Expected 64 hash bits, received ${count}.`)
  return bigintToHash(value)
}

export function averageHash(gray: Uint8Array, width: number, height: number): string {
  assertGrayImage(gray, width, height)
  const pixels = resizeGray(gray, width, height, HASH_EDGE, HASH_EDGE)
  let total = 0
  for (const pixel of pixels) total += pixel
  const average = total / pixels.length
  return bitsToHash(Array.from(pixels, (pixel) => pixel >= average))
}

export function differenceHash(gray: Uint8Array, width: number, height: number): string {
  assertGrayImage(gray, width, height)
  const comparisonWidth = HASH_EDGE + 1
  const pixels = resizeGray(gray, width, height, comparisonWidth, HASH_EDGE)
  const bits: boolean[] = []

  for (let y = 0; y < HASH_EDGE; y += 1) {
    const rowOffset = y * comparisonWidth
    for (let x = 0; x < HASH_EDGE; x += 1) {
      bits.push((pixels[rowOffset + x] ?? 0) > (pixels[rowOffset + x + 1] ?? 0))
    }
  }
  return bitsToHash(bits)
}

const DCT_COSINES = Array.from({ length: DCT_COEFFICIENT_EDGE }, (_, frequency) =>
  Float64Array.from({ length: PHASH_EDGE }, (_, position) =>
    Math.cos(((2 * position + 1) * frequency * Math.PI) / (2 * PHASH_EDGE)),
  ),
)

const DCT_SCALES = Float64Array.from({ length: DCT_COEFFICIENT_EDGE }, (_, frequency) =>
  frequency === 0 ? Math.sqrt(1 / PHASH_EDGE) : Math.sqrt(2 / PHASH_EDGE),
)

function lowFrequencyDct(pixels: Float64Array): Float64Array {
  const horizontal = new Float64Array(PHASH_EDGE * DCT_COEFFICIENT_EDGE)

  for (let y = 0; y < PHASH_EDGE; y += 1) {
    const rowOffset = y * PHASH_EDGE
    for (let u = 0; u < DCT_COEFFICIENT_EDGE; u += 1) {
      const cosines = DCT_COSINES[u]
      if (!cosines) continue
      let sum = 0
      for (let x = 0; x < PHASH_EDGE; x += 1) {
        sum += (pixels[rowOffset + x] ?? 0) * (cosines[x] ?? 0)
      }
      horizontal[y * DCT_COEFFICIENT_EDGE + u] = sum * (DCT_SCALES[u] ?? 1)
    }
  }

  const coefficients = new Float64Array(DCT_COEFFICIENT_EDGE * DCT_COEFFICIENT_EDGE)
  for (let v = 0; v < DCT_COEFFICIENT_EDGE; v += 1) {
    const cosines = DCT_COSINES[v]
    if (!cosines) continue
    for (let u = 0; u < DCT_COEFFICIENT_EDGE; u += 1) {
      let sum = 0
      for (let y = 0; y < PHASH_EDGE; y += 1) {
        sum +=
          (horizontal[y * DCT_COEFFICIENT_EDGE + u] ?? 0) *
          (cosines[y] ?? 0)
      }
      const coefficient = sum * (DCT_SCALES[v] ?? 1)
      coefficients[v * DCT_COEFFICIENT_EDGE + u] =
        Math.abs(coefficient) < 1e-9 ? 0 : coefficient
    }
  }
  return coefficients
}

function median(values: number[]): number {
  values.sort((left, right) => left - right)
  const middle = Math.floor(values.length / 2)
  if (values.length % 2 === 1) return values[middle] ?? 0
  return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2
}

export function perceptualHash(gray: Uint8Array, width: number, height: number): string {
  assertGrayImage(gray, width, height)
  const pixels = resizeGray(gray, width, height, PHASH_EDGE, PHASH_EDGE)
  const coefficients = lowFrequencyDct(pixels)
  const acCoefficients = Array.from(coefficients.slice(1))
  const threshold = median(acCoefficients)
  return bitsToHash(Array.from(coefficients, (coefficient) => coefficient > threshold))
}

