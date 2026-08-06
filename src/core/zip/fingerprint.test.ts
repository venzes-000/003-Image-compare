// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createZipFingerprint } from './fingerprint'

describe('ZIP-Fingerabdruck', () => {
  it('ist deterministisch und reagiert auf Metadaten sowie Anfang/Ende', async () => {
    const first = new File([Uint8Array.from([1, 2, 3, 4, 5, 6])], 'bilder.zip', { lastModified: 123 })
    const same = new File([Uint8Array.from([1, 2, 3, 4, 5, 6])], 'bilder.zip', { lastModified: 123 })
    const changedEnd = new File([Uint8Array.from([1, 2, 3, 4, 5, 7])], 'bilder.zip', { lastModified: 123 })
    const renamed = new File([Uint8Array.from([1, 2, 3, 4, 5, 6])], 'andere.zip', { lastModified: 123 })

    const fingerprint = await createZipFingerprint(first, 2)
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/)
    await expect(createZipFingerprint(same, 2)).resolves.toBe(fingerprint)
    await expect(createZipFingerprint(changedEnd, 2)).resolves.not.toBe(fingerprint)
    await expect(createZipFingerprint(renamed, 2)).resolves.not.toBe(fingerprint)
  })
})
