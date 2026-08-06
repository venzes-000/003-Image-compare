// @vitest-environment node

import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { ZipArchiveService } from './reader'

describe('ZipArchiveService', () => {
  it('extrahiert Bilder strikt nacheinander und überspringt falsche Signaturen', async () => {
    const archive = new JSZip()
    archive.file('Fotos/a.jpg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))
    archive.file('Fotos/b.png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    archive.file('Fotos/kaputt.webp', Uint8Array.from([1, 2, 3, 4]))
    archive.file('Notiz.txt', 'lokal')
    const bytes = await archive.generateAsync({ type: 'arraybuffer' })
    const blob = new Blob([bytes])
    const service = new ZipArchiveService()
    const paths: string[] = []
    let activeHandlers = 0
    let maximumActiveHandlers = 0

    const result = await service.readImages(blob, async (image) => {
      activeHandlers += 1
      maximumActiveHandlers = Math.max(maximumActiveHandlers, activeHandlers)
      paths.push(image.path)
      await Promise.resolve()
      activeHandlers -= 1
    }, { useWebWorkers: false })

    expect(paths).toEqual(['Fotos/a.jpg', 'Fotos/b.png'])
    expect(maximumActiveHandlers).toBe(1)
    expect(result.processedImages).toBe(2)
    expect(result.inspection.summary.corruptedImages).toBe(1)
    expect(result.errors[0]?.code).toBe('corrupt-image')
  })

  it('meldet ungültige Archive verständlich', async () => {
    const service = new ZipArchiveService()
    await expect(service.inspect(new Blob(['kein zip']), { useWebWorkers: false })).rejects.toMatchObject({
      code: 'invalid-zip',
      message: expect.stringContaining('gültige'),
    })
  })
})
