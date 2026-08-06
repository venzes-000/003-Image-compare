// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { AnalysisStorage, isIndexedDbAvailable } from './database'

describe('AnalysisStorage ohne IndexedDB', () => {
  it('erkennt eine nicht verfügbare Datenbank ohne Absturz', async () => {
    const storage = new AnalysisStorage()
    expect(isIndexedDbAvailable()).toBe(false)
    await expect(storage.isAvailable()).resolves.toBe(false)
    await expect(storage.loadAnalysis('fingerprint')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('weist ungültige Schlüssel bereits vor einem Datenbankzugriff zurück', async () => {
    const storage = new AnalysisStorage()
    await expect(storage.loadAnalysis('   ')).rejects.toMatchObject({ code: 'invalid-data' })
  })
})
