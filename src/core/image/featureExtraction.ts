import { averageHash, differenceHash, perceptualHash } from '../hashing'
import { APP_LIMITS } from '../config/limits'
import type { ImageFeatureRecord, SupportedImageFormat } from '../types'

export interface ImageIdentity {
  id: string
  path: string
  name: string
  size: number
  compressedSize: number
  mime: string
  format: SupportedImageFormat
}

export function rgbaToGray(data: Uint8ClampedArray): Uint8Array {
  const gray = new Uint8Array(data.length / 4)
  for (let source = 0, target = 0; source < data.length; source += 4, target += 1) {
    const red = data[source] ?? 0
    const green = data[source + 1] ?? 0
    const blue = data[source + 2] ?? 0
    gray[target] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114)
  }
  return gray
}

function rgbToHsv(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const maximum = Math.max(r, g, b)
  const minimum = Math.min(r, g, b)
  const delta = maximum - minimum
  let hue = 0

  if (delta !== 0) {
    if (maximum === r) hue = ((g - b) / delta) % 6
    else if (maximum === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue = (hue * 60 + 360) % 360
  }

  return [hue, maximum === 0 ? 0 : delta / maximum, maximum]
}

export function createHsvHistogram(data: Uint8ClampedArray): number[] {
  const hueBins = 8
  const saturationBins = 4
  const valueBins = 4
  const histogram = new Array<number>(hueBins * saturationBins * valueBins).fill(0)
  const pixels = Math.max(1, data.length / 4)

  for (let index = 0; index < data.length; index += 4) {
    const [hue, saturation, value] = rgbToHsv(
      data[index] ?? 0,
      data[index + 1] ?? 0,
      data[index + 2] ?? 0,
    )
    const hueIndex = Math.min(hueBins - 1, Math.floor((hue / 360) * hueBins))
    const saturationIndex = Math.min(saturationBins - 1, Math.floor(saturation * saturationBins))
    const valueIndex = Math.min(valueBins - 1, Math.floor(value * valueBins))
    const bin = hueIndex * saturationBins * valueBins + saturationIndex * valueBins + valueIndex
    histogram[bin] = (histogram[bin] ?? 0) + 1
  }

  return histogram.map((count) => count / pixels)
}

export function createFeatureRecord(
  identity: ImageIdentity,
  width: number,
  height: number,
  imageData: ImageData,
): ImageFeatureRecord {
  const gray = rgbaToGray(imageData.data)
  const luminanceMean = gray.reduce((sum, value) => sum + value, 0) / Math.max(1, gray.length) / 255
  const analysisSize = APP_LIMITS.analysisSize

  return {
    ...identity,
    width,
    height,
    aspectRatio: width / Math.max(1, height),
    aHash: averageHash(gray, analysisSize, analysisSize),
    dHash: differenceHash(gray, analysisSize, analysisSize),
    pHash: perceptualHash(gray, analysisSize, analysisSize),
    histogram: createHsvHistogram(imageData.data),
    luminanceMean,
    gray,
    thumbnailKey: `${identity.id}:thumbnail`,
    decision: 'unreviewed',
  }
}
