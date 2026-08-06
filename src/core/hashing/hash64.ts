export const HASH_BITS = 64
export const HASH_HEX_LENGTH = HASH_BITS / 4

const POPCOUNT_NIBBLE = Object.freeze([0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4])

function nibbleFromCode(code: number): number {
  if (code >= 48 && code <= 57) return code - 48
  if (code >= 65 && code <= 70) return code - 55
  if (code >= 97 && code <= 102) return code - 87
  return -1
}

export function bigintToHash(value: bigint): string {
  if (value < 0n || value >= 1n << 64n) {
    throw new RangeError('A 64-bit hash must be between 0 and 2^64 - 1.')
  }
  return value.toString(16).padStart(HASH_HEX_LENGTH, '0')
}

export function hashToBigint(hash: string): bigint {
  validateHash(hash)
  return BigInt(`0x${hash}`)
}

export function validateHash(hash: string): void {
  if (hash.length !== HASH_HEX_LENGTH) {
    throw new RangeError(`A 64-bit hash must contain exactly ${HASH_HEX_LENGTH} hexadecimal characters.`)
  }
  for (let index = 0; index < HASH_HEX_LENGTH; index += 1) {
    if (nibbleFromCode(hash.charCodeAt(index)) < 0) {
      throw new TypeError('A 64-bit hash may only contain hexadecimal characters.')
    }
  }
}

/** Counts differing bits without converting hot-path hash strings to BigInt. */
export function hammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== HASH_HEX_LENGTH || hashB.length !== HASH_HEX_LENGTH) {
    throw new RangeError(`64-bit hashes must contain exactly ${HASH_HEX_LENGTH} hexadecimal characters.`)
  }

  let distance = 0
  for (let index = 0; index < HASH_HEX_LENGTH; index += 1) {
    const left = nibbleFromCode(hashA.charCodeAt(index))
    const right = nibbleFromCode(hashB.charCodeAt(index))
    if (left < 0 || right < 0) {
      throw new TypeError('64-bit hashes may only contain hexadecimal characters.')
    }
    distance += POPCOUNT_NIBBLE[left ^ right] ?? 0
  }
  return distance
}

