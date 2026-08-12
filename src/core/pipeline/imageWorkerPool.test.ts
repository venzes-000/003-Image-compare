import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageWorkerPool, ImageWorkerPoolUnavailableError } from './imageWorkerPool'
import type { AnalyzeImagePayload } from '../../workers/workerProtocol'

const originalWorker = globalThis.Worker
const originalOffscreenCanvas = globalThis.OffscreenCanvas
const originalCreateImageBitmap = globalThis.createImageBitmap

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalWorker) vi.stubGlobal('Worker', originalWorker)
  if (originalOffscreenCanvas) vi.stubGlobal('OffscreenCanvas', originalOffscreenCanvas)
  if (originalCreateImageBitmap) vi.stubGlobal('createImageBitmap', originalCreateImageBitmap)
})

describe('ImageWorkerPool diagnostics', () => {
  it('reports every missing acceleration capability in main-thread mode', () => {
    vi.stubGlobal('Worker', undefined)
    vi.stubGlobal('OffscreenCanvas', undefined)
    vi.stubGlobal('createImageBitmap', undefined)

    const pool = new ImageWorkerPool(4)

    expect(pool.mode).toBe('main-thread')
    expect(pool.capacity).toBe(1)
    expect(pool.fallbackReason).toContain('Web Worker')
    expect(pool.fallbackReason).toContain('OffscreenCanvas')
    expect(pool.fallbackReason).toContain('createImageBitmap')
  })

  it('reports the configured worker count on the accelerated path', () => {
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage(): void {}
      terminate(): void {}
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class FakeOffscreenCanvas {})
    vi.stubGlobal('createImageBitmap', vi.fn())

    const pool = new ImageWorkerPool(3)

    expect(pool.mode).toBe('worker-pool')
    expect(pool.capacity).toBe(3)
    expect(pool.fallbackReason).toBeUndefined()
    pool.dispose()
  })

  it('removes a crashed worker and rejects queued work instead of hanging forever', async () => {
    const workers: FakeWorker[] = []
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage(): void {}
      terminate(): void {}
      constructor() { workers.push(this) }
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class FakeOffscreenCanvas {})
    vi.stubGlobal('createImageBitmap', vi.fn())

    const payload = (taskId: string): AnalyzeImagePayload => ({
      taskId,
      image: { id: taskId, path: `${taskId}.jpg`, name: `${taskId}.jpg`, size: 1, compressedSize: 1, mime: 'image/jpeg', format: 'jpeg' },
      buffer: new ArrayBuffer(1),
    })
    const pool = new ImageWorkerPool(1)
    const active = pool.analyze(payload('active'))
    const queued = pool.analyze(payload('queued'))
    workers[0]?.onerror?.({ message: 'worker crashed' } as ErrorEvent)

    await expect(active).rejects.toBeInstanceOf(ImageWorkerPoolUnavailableError)
    await expect(queued).rejects.toBeInstanceOf(ImageWorkerPoolUnavailableError)
    pool.dispose()
  })

  it('rejects analyze after last worker crashed', async () => {
    const workers: FakeWorker[] = []
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage(): void {}
      terminate(): void {}
      constructor() { workers.push(this) }
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class FakeOffscreenCanvas {})
    vi.stubGlobal('createImageBitmap', vi.fn())

    const payload = (taskId: string): AnalyzeImagePayload => ({
      taskId,
      image: { id: taskId, path: `${taskId}.jpg`, name: `${taskId}.jpg`, size: 1, compressedSize: 1, mime: 'image/jpeg', format: 'jpeg' },
      buffer: new ArrayBuffer(1),
    })
    const fallback = vi.fn()
    const pool = new ImageWorkerPool(1, { onRuntimeFallback: fallback })
    const active = pool.analyze(payload('active'))
    workers[0]?.onerror?.({ message: 'worker crashed' } as ErrorEvent)

    await expect(active).rejects.toThrow(/worker crashed/)
    await expect(pool.analyze(payload('after-crash'))).rejects.toBeInstanceOf(ImageWorkerPoolUnavailableError)
    expect(fallback).toHaveBeenCalledOnce()
    pool.dispose()
  })

  it('reports an active task as an infrastructure failure even when another worker survives', async () => {
    const workers: FakeWorker[] = []
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage(): void {}
      terminate(): void {}
      constructor() { workers.push(this) }
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class FakeOffscreenCanvas {})
    vi.stubGlobal('createImageBitmap', vi.fn())
    const pool = new ImageWorkerPool(2)
    const active = pool.analyze({
      taskId: 'active',
      image: { id: 'active', path: 'active.jpg', name: 'active.jpg', size: 1, compressedSize: 1, mime: 'image/jpeg', format: 'jpeg' },
      buffer: new ArrayBuffer(1),
    })
    workers[0]?.onerror?.({ message: 'one worker crashed' } as ErrorEvent)

    await expect(active).rejects.toBeInstanceOf(ImageWorkerPoolUnavailableError)
    pool.dispose()
  })

  it('types synchronous worker transport errors as infrastructure failures', async () => {
    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage(): void { throw new Error('transport failed') }
      terminate(): void {}
    }
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class FakeOffscreenCanvas {})
    vi.stubGlobal('createImageBitmap', vi.fn())
    const pool = new ImageWorkerPool(1)

    await expect(pool.analyze({
      taskId: 'active',
      image: { id: 'active', path: 'active.jpg', name: 'active.jpg', size: 1, compressedSize: 1, mime: 'image/jpeg', format: 'jpeg' },
      buffer: new ArrayBuffer(1),
    })).rejects.toBeInstanceOf(ImageWorkerPoolUnavailableError)
    pool.dispose()
  })
})
