/// <reference lib="webworker" />

import { APP_LIMITS } from '../core/config/limits'
import { createFeatureRecord } from '../core/image/featureExtraction'
import type { ImageWorkerRequest, ImageWorkerResponse } from './workerProtocol'

declare const self: DedicatedWorkerGlobalScope

let cancelled = false

function respond(message: ImageWorkerResponse, transfers: Transferable[] = []): void {
  self.postMessage(message, transfers)
}

self.onmessage = async (event: MessageEvent<ImageWorkerRequest>) => {
  if (event.data.type === 'CANCEL') {
    cancelled = true
    return
  }

  const { taskId, image, buffer } = event.data.payload
  try {
    cancelled = false
    const blob = new Blob([buffer], { type: image.mime })
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    if (cancelled) {
      bitmap.close()
      return
    }

    const analysisSize = APP_LIMITS.analysisSize
    const analysisCanvas = new OffscreenCanvas(analysisSize, analysisSize)
    const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true })
    if (!analysisContext) throw new Error('Der Analyse-Canvas konnte nicht initialisiert werden.')
    analysisContext.drawImage(bitmap, 0, 0, analysisSize, analysisSize)
    const imageData = analysisContext.getImageData(0, 0, analysisSize, analysisSize)

    const maxEdge = APP_LIMITS.thumbnailMaxEdge
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const thumbnailWidth = Math.max(1, Math.round(bitmap.width * scale))
    const thumbnailHeight = Math.max(1, Math.round(bitmap.height * scale))
    const thumbnailCanvas = new OffscreenCanvas(thumbnailWidth, thumbnailHeight)
    const thumbnailContext = thumbnailCanvas.getContext('2d')
    if (!thumbnailContext) throw new Error('Die Vorschau konnte nicht erzeugt werden.')
    thumbnailContext.drawImage(bitmap, 0, 0, thumbnailWidth, thumbnailHeight)
    const thumbnailBlob = await thumbnailCanvas.convertToBlob({ type: 'image/webp', quality: 0.78 })
    const thumbnail = await thumbnailBlob.arrayBuffer()
    const feature = createFeatureRecord(image, bitmap.width, bitmap.height, imageData)
    bitmap.close()

    respond(
      { type: 'IMAGE_ANALYZED', payload: { taskId, feature, thumbnail, thumbnailMime: thumbnailBlob.type } },
      [feature.gray.buffer, thumbnail],
    )
  } catch (error) {
    const detail = error instanceof Error ? error.stack : undefined
    const response: ImageWorkerResponse = {
      type: 'ERROR',
      payload: {
        taskId,
        message: error instanceof Error ? error.message : 'Das Bild konnte nicht analysiert werden.',
        ...(detail ? { detail } : {}),
      },
    }
    respond(response)
  }
}

export {}
