import { describe, expect, it } from 'vitest'
import {
  averageHash,
  differenceHash,
  hammingDistance,
  perceptualHash,
} from '..'

function syntheticImage(width: number, height: number): Uint8Array {
  return Uint8Array.from({ length: width * height }, (_, index) => {
    const x = index % width
    const y = Math.floor(index / width)
    const normalizedX = (x + 0.5) / width
    const normalizedY = (y + 0.5) / height
    const circle = (normalizedX - 0.3) ** 2 + (normalizedY - 0.35) ** 2 < 0.08 ** 2
    const stripe = normalizedX > 0.58 && normalizedX < 0.76 && normalizedY > 0.18
    return circle ? 230 : stripe ? 175 : Math.round(25 + normalizedX * 70 + normalizedY * 35)
  })
}

describe('64-bit perceptual hashes', () => {
  it('returns deterministic, fixed-width hexadecimal hashes', () => {
    const gray = syntheticImage(64, 64)
    for (const calculate of [averageHash, differenceHash, perceptualHash]) {
      const first = calculate(gray, 64, 64)
      expect(first).toMatch(/^[0-9a-f]{16}$/)
      expect(calculate(gray, 64, 64)).toBe(first)
      expect(hammingDistance(first, first)).toBe(0)
    }
  })

  it('is stable for a normalized image rendered at another resolution', () => {
    const small = syntheticImage(64, 64)
    const large = syntheticImage(128, 128)
    expect(hammingDistance(averageHash(small, 64, 64), averageHash(large, 128, 128))).toBeLessThanOrEqual(3)
    expect(hammingDistance(differenceHash(small, 64, 64), differenceHash(large, 128, 128))).toBeLessThanOrEqual(8)
    expect(hammingDistance(perceptualHash(small, 64, 64), perceptualHash(large, 128, 128))).toBeLessThanOrEqual(8)
  })

  it('keeps the DCT hash close after a uniform brightness change', () => {
    const original = syntheticImage(64, 64)
    const brighter = original.map((value) => Math.min(255, value + 18))
    expect(hammingDistance(perceptualHash(original, 64, 64), perceptualHash(brighter, 64, 64))).toBeLessThanOrEqual(2)
  })

  it('keeps the DCT hash close after JPEG-like color quantization', () => {
    const original = syntheticImage(64, 64)
    const quantized = original.map((value) => Math.round(value / 12) * 12)
    expect(hammingDistance(perceptualHash(original, 64, 64), perceptualHash(quantized, 64, 64))).toBeLessThanOrEqual(4)
  })

  it('keeps a small center crop inside the sensitive candidate range', () => {
    const original = syntheticImage(64, 64)
    const cropped = Uint8Array.from({ length: 56 * 56 }, (_, index) => {
      const x = index % 56
      const y = Math.floor(index / 56)
      return original[(y + 4) * 64 + x + 4] ?? 0
    })
    const distance = hammingDistance(
      perceptualHash(original, 64, 64),
      perceptualHash(cropped, 56, 56),
    )
    expect(distance).toBeLessThanOrEqual(20)
  })

  it('separates clearly different spatial structures', () => {
    const horizontal = Uint8Array.from({ length: 64 * 64 }, (_, index) =>
      (index % 64) < 32 ? 20 : 235,
    )
    const vertical = Uint8Array.from({ length: 64 * 64 }, (_, index) =>
      Math.floor(index / 64) < 32 ? 20 : 235,
    )
    expect(hammingDistance(perceptualHash(horizontal, 64, 64), perceptualHash(vertical, 64, 64))).toBeGreaterThan(3)
  })

  it('has stable hashes for flat images', () => {
    const flat = new Uint8Array(64 * 64).fill(128)
    expect(averageHash(flat, 64, 64)).toBe('ffffffffffffffff')
    expect(differenceHash(flat, 64, 64)).toBe('0000000000000000')
    expect(perceptualHash(flat, 64, 64)).toBe('8000000000000000')
  })

  it('rejects mismatched dimensions', () => {
    expect(() => averageHash(new Uint8Array(15), 4, 4)).toThrow(/Expected 16/)
    expect(() => differenceHash(new Uint8Array(1), 0, 1)).toThrow(/dimensions/)
  })
})

describe('hammingDistance', () => {
  it('counts all differing and mixed bits', () => {
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64)
    expect(hammingDistance('0123456789abcdef', '0123456789abcdee')).toBe(1)
    expect(hammingDistance('AAAAAAAAAAAAAAAA', '5555555555555555')).toBe(64)
  })

  it('validates both inputs', () => {
    expect(() => hammingDistance('0', '0000000000000000')).toThrow(/exactly 16/)
    expect(() => hammingDistance('000000000000000g', '0000000000000000')).toThrow(/hexadecimal/)
  })
})
