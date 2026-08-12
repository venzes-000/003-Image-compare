import { APP_LIMITS } from '../config/limits'
import { createFeatureRecord } from './featureExtraction'
import { extractCaptureMetadata } from './metadataExtraction'
import { decodeSpecialImage, needsSpecialDecoder } from './specialDecoders'
import type { AnalyzeImagePayload, ImageAnalyzedPayload } from '../../workers/workerProtocol'

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Die Vorschau konnte nicht gespeichert werden.'))), type, quality)
  })
}

async function decodeWithImageElement(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function analyzeImageOnMainThread(payload: AnalyzeImagePayload): Promise<ImageAnalyzedPayload> {
  const totalStartedAt = performance.now()
  const blob = new Blob([payload.buffer], { type: payload.image.mime })
  const metadataStartedAt = performance.now()
  const metadataPromise = extractCaptureMetadata(payload.buffer, payload.image.archiveModifiedAt)
  const decodeStartedAt = performance.now()
  let bitmap: ImageBitmap | undefined
  let source: CanvasImageSource
  let width: number
  let height: number

  try {
    if (needsSpecialDecoder(payload.image.format)) {
      const decoded = await decodeSpecialImage(blob, payload.buffer, payload.image.format)
      bitmap = decoded.bitmap
      width = decoded.width
      height = decoded.height
      if (bitmap) {
        source = bitmap
      } else if (decoded.rgba) {
        const decodedCanvas = document.createElement('canvas')
        decodedCanvas.width = width
        decodedCanvas.height = height
        const decodedContext = decodedCanvas.getContext('2d')
        if (!decodedContext) throw new Error('Der Spezialdecoder konnte kein Bild erzeugen.')
        const decodedImageData = new ImageData(width, height)
        decodedImageData.data.set(decoded.rgba)
        decodedContext.putImageData(decodedImageData, 0, 0)
        source = decodedCanvas
      } else {
        throw new Error('Der Spezialdecoder lieferte keine Bilddaten.')
      }
    } else if ('createImageBitmap' in window) {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      source = bitmap
      width = bitmap.width
      height = bitmap.height
    } else {
      const image = await decodeWithImageElement(blob)
      source = image
      width = image.naturalWidth
      height = image.naturalHeight
    }
    const decodeMs = performance.now() - decodeStartedAt
    const metadata = await metadataPromise
    const metadataMs = performance.now() - metadataStartedAt

    const analysisStartedAt = performance.now()
    const analysisCanvas = document.createElement('canvas')
    analysisCanvas.width = APP_LIMITS.analysisSize
    analysisCanvas.height = APP_LIMITS.analysisSize
    const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true })
    if (!analysisContext) throw new Error('Der Kompatibilitätsmodus konnte nicht gestartet werden.')
    analysisContext.drawImage(source, 0, 0, APP_LIMITS.analysisSize, APP_LIMITS.analysisSize)
    const imageData = analysisContext.getImageData(0, 0, APP_LIMITS.analysisSize, APP_LIMITS.analysisSize)
    const feature = createFeatureRecord(payload.image, width, height, imageData, metadata)
    const analysisMs = performance.now() - analysisStartedAt

    const thumbnailStartedAt = performance.now()
    const scale = Math.min(1, APP_LIMITS.thumbnailMaxEdge / Math.max(width, height))
    const thumbnailCanvas = document.createElement('canvas')
    thumbnailCanvas.width = Math.max(1, Math.round(width * scale))
    thumbnailCanvas.height = Math.max(1, Math.round(height * scale))
    const thumbnailContext = thumbnailCanvas.getContext('2d')
    if (!thumbnailContext) throw new Error('Die Vorschau konnte nicht erzeugt werden.')
    thumbnailContext.drawImage(source, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)
    const thumbnailBlob = await canvasToBlob(thumbnailCanvas, 'image/webp', 0.78)
    const thumbnail = await thumbnailBlob.arrayBuffer()
    const thumbnailMs = performance.now() - thumbnailStartedAt

    return {
      taskId: payload.taskId,
      feature,
      thumbnail,
      thumbnailMime: thumbnailBlob.type,
      timings: {
        metadataMs,
        decodeMs,
        analysisMs,
        thumbnailMs,
        totalMs: performance.now() - totalStartedAt,
      },
    }
  } finally {
    bitmap?.close()
  }
}
