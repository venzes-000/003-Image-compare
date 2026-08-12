import { averageHash, differenceHash, hammingDistance, perceptualHash } from '../hashing'
import type { ImageFeatureRecord, QuarterTurn, RotatedHashVariant } from '../types'

export const QUARTER_TURNS: readonly QuarterTurn[] = [0, 90, 180, 270]

export interface RotatedGrayImage {
  gray: Uint8Array
  width: number
  height: number
}

export interface RotationAlignment {
  targetRotationDegrees: QuarterTurn
  aHashDistance: number
  dHashDistance: number
  pHashDistance: number
  aspectRatioDifference: number
  rank: number
}

function assertGrayImage(gray: Uint8Array, width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Image dimensions must be positive safe integers.')
  }
  if (gray.length !== width * height) {
    throw new RangeError(`Expected ${width * height} grayscale values, received ${gray.length}.`)
  }
}

export function rotateGrayQuarterTurn(
  gray: Uint8Array,
  width: number,
  height: number,
  rotationDegrees: QuarterTurn,
): RotatedGrayImage {
  assertGrayImage(gray, width, height)
  if (rotationDegrees === 0) return { gray, width, height }

  const outputWidth = rotationDegrees === 180 ? width : height
  const outputHeight = rotationDegrees === 180 ? height : width
  const rotated = new Uint8Array(gray.length)

  for (let sourceY = 0; sourceY < height; sourceY += 1) {
    for (let sourceX = 0; sourceX < width; sourceX += 1) {
      let targetX: number
      let targetY: number
      if (rotationDegrees === 90) {
        targetX = height - 1 - sourceY
        targetY = sourceX
      } else if (rotationDegrees === 180) {
        targetX = width - 1 - sourceX
        targetY = height - 1 - sourceY
      } else {
        targetX = sourceY
        targetY = width - 1 - sourceX
      }
      rotated[targetY * outputWidth + targetX] = gray[sourceY * width + sourceX] ?? 0
    }
  }

  return { gray: rotated, width: outputWidth, height: outputHeight }
}

export function createRotatedHashVariants(
  gray: Uint8Array,
  width: number,
  height: number,
  aspectRatio: number,
): RotatedHashVariant[] {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new RangeError('Aspect ratio must be a positive finite number.')
  }

  return QUARTER_TURNS.map((rotationDegrees) => {
    const rotated = rotateGrayQuarterTurn(gray, width, height, rotationDegrees)
    return {
      rotationDegrees,
      aspectRatio: rotationDegrees === 90 || rotationDegrees === 270 ? 1 / aspectRatio : aspectRatio,
      aHash: averageHash(rotated.gray, rotated.width, rotated.height),
      dHash: differenceHash(rotated.gray, rotated.width, rotated.height),
      pHash: perceptualHash(rotated.gray, rotated.width, rotated.height),
    }
  })
}

export function hasCompleteRotationVariants(
  variants: readonly RotatedHashVariant[] | undefined,
): variants is readonly RotatedHashVariant[] {
  return QUARTER_TURNS.every((rotationDegrees) =>
    variants?.some((variant) => variant.rotationDegrees === rotationDegrees),
  )
}

function primaryVariant(image: ImageFeatureRecord): RotatedHashVariant {
  return image.rotationVariants?.find((variant) => variant.rotationDegrees === 0) ?? {
    rotationDegrees: 0,
    aspectRatio: image.aspectRatio,
    aHash: image.aHash,
    dHash: image.dHash,
    pHash: image.pHash,
  }
}

function targetVariants(image: ImageFeatureRecord): readonly RotatedHashVariant[] {
  return hasCompleteRotationVariants(image.rotationVariants)
    ? image.rotationVariants
    : [primaryVariant(image)]
}

function normalizedAspectRatioDifference(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(left, right, Number.EPSILON)
}

/**
 * Finds the best relative quarter-turn of `target` in the coordinate system of
 * `source`. Only the 64x64 analysis image is rotated; original files are never
 * decoded again.
 */
export function findBestRotationAlignment(
  source: ImageFeatureRecord,
  target: ImageFeatureRecord,
): RotationAlignment {
  const sourceVariant = primaryVariant(source)
  let best: RotationAlignment | undefined

  for (const targetVariant of targetVariants(target)) {
    const aHashDistance = hammingDistance(sourceVariant.aHash, targetVariant.aHash)
    const dHashDistance = hammingDistance(sourceVariant.dHash, targetVariant.dHash)
    const pHashDistance = hammingDistance(sourceVariant.pHash, targetVariant.pHash)
    const aspectRatioDifference = normalizedAspectRatioDifference(
      sourceVariant.aspectRatio,
      targetVariant.aspectRatio,
    )
    const rank =
      pHashDistance * 0.5 +
      dHashDistance * 0.3 +
      aHashDistance * 0.2 +
      aspectRatioDifference * 20
    const alignment: RotationAlignment = {
      targetRotationDegrees: targetVariant.rotationDegrees,
      aHashDistance,
      dHashDistance,
      pHashDistance,
      aspectRatioDifference,
      rank,
    }

    if (
      !best ||
      alignment.rank < best.rank ||
      (alignment.rank === best.rank && alignment.targetRotationDegrees < best.targetRotationDegrees)
    ) {
      best = alignment
    }
  }

  if (!best) throw new Error('No rotation alignment could be calculated.')
  return best
}
