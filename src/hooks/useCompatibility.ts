import { useMemo } from 'react'
import type { CompatibilityItem } from '../core/types'

function hasWebGl(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export function useCompatibility(): { items: CompatibilityItem[]; ready: boolean; summary: string } {
  return useMemo(() => {
    const navigatorDetails = navigator as Navigator & { deviceMemory?: number }
    const cores = navigator.hardwareConcurrency || 0
    const memory = navigatorDetails.deviceMemory
    const items: CompatibilityItem[] = [
      {
        key: 'worker',
        label: 'Web Worker',
        available: typeof Worker !== 'undefined',
        required: true,
        detail: typeof Worker !== 'undefined' ? 'Berechnungen können im Hintergrund laufen.' : 'Die Analyse kann auf diesem Browser nicht zuverlässig ausgeführt werden.',
      },
      {
        key: 'indexeddb',
        label: 'Lokaler Speicher',
        available: typeof indexedDB !== 'undefined',
        required: false,
        detail: typeof indexedDB !== 'undefined' ? 'Optionales Fortsetzen ist möglich.' : 'Die Analyse funktioniert ohne dauerhaften Cache.',
      },
      {
        key: 'bitmap',
        label: 'Bilddekodierung',
        available: typeof createImageBitmap !== 'undefined',
        required: false,
        detail: typeof createImageBitmap !== 'undefined' ? 'Schnelle Bilddekodierung verfügbar.' : 'Kompatibilitätsmodus wird verwendet.',
      },
      {
        key: 'offscreen',
        label: 'OffscreenCanvas',
        available: typeof OffscreenCanvas !== 'undefined',
        required: false,
        detail: typeof OffscreenCanvas !== 'undefined' ? 'Vorschauen können im Hintergrund entstehen.' : 'Kompatibilitätsmodus wird verwendet.',
      },
      {
        key: 'wasm',
        label: 'WebAssembly',
        available: typeof WebAssembly !== 'undefined',
        required: false,
        detail: 'Für spätere optionale Tiefenprüfungen.',
      },
      {
        key: 'webgl',
        label: 'WebGL',
        available: hasWebGl(),
        required: false,
        detail: 'Optionale Beschleunigung für erweiterte Prüfungen.',
      },
      {
        key: 'webgpu',
        label: 'WebGPU',
        available: Boolean(navigatorDetails.gpu),
        required: false,
        detail: navigatorDetails.gpu ? 'Optionale Hardwarebeschleunigung verfügbar.' : 'Nicht erforderlich – die Grundprüfung funktioniert ohne WebGPU.',
      },
      {
        key: 'hardware',
        label: 'Gerätehinweise',
        available: true,
        required: false,
        detail: `${cores || 'Unbekannte Anzahl'} logische Prozessoren${memory ? `, ungefähr ${memory} GB Arbeitsspeicher` : ''}.`,
      },
    ]
    const ready = items.filter((item) => item.required).every((item) => item.available)
    return {
      items,
      ready,
      summary: ready ? 'Grundfunktionen verfügbar' : 'Die erforderlichen Browserfunktionen sind nicht vollständig verfügbar',
    }
  }, [])
}
