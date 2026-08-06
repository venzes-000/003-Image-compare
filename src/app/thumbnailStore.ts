import { analysisStorage } from '../core/storage'

const thumbnailMemory = new Map<string, Blob>()
let activeFingerprint: string | undefined

export const thumbnailStore = {
  set(key: string, data: ArrayBuffer | Blob, mime = 'image/webp'): void {
    thumbnailMemory.set(key, data instanceof Blob ? data : new Blob([data], { type: mime }))
  },
  get(key: string): Blob | undefined {
    return thumbnailMemory.get(key)
  },
  async getAsync(key: string): Promise<Blob | undefined> {
    const inMemory = thumbnailMemory.get(key)
    if (inMemory) return inMemory
    if (!activeFingerprint) return undefined
    try {
      const stored = await analysisStorage.loadThumbnail(activeFingerprint, key)
      if (stored) thumbnailMemory.set(key, stored)
      return stored
    } catch {
      return undefined
    }
  },
  setFingerprint(fingerprint: string | undefined): void {
    activeFingerprint = fingerprint
  },
  has(key: string): boolean {
    return thumbnailMemory.has(key)
  },
  clear(): void {
    thumbnailMemory.clear()
    activeFingerprint = undefined
  },
}
