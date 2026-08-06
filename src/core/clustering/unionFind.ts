function compareValues<T>(left: T, right: T): number {
  const leftText = String(left)
  const rightText = String(right)
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0
}

export class UnionFind<T> {
  readonly #parent = new Map<T, T>()
  readonly #rank = new Map<T, number>()

  constructor(values: Iterable<T> = []) {
    for (const value of values) this.add(value)
  }

  add(value: T): void {
    if (this.#parent.has(value)) return
    this.#parent.set(value, value)
    this.#rank.set(value, 0)
  }

  has(value: T): boolean {
    return this.#parent.has(value)
  }

  find(value: T): T {
    const directParent = this.#parent.get(value)
    if (directParent === undefined) throw new Error(`Unknown UnionFind value: ${String(value)}`)
    if (Object.is(directParent, value)) return value
    const root = this.find(directParent)
    this.#parent.set(value, root)
    return root
  }

  union(left: T, right: T): boolean {
    let leftRoot = this.find(left)
    let rightRoot = this.find(right)
    if (Object.is(leftRoot, rightRoot)) return false

    const leftRank = this.#rank.get(leftRoot) ?? 0
    const rightRank = this.#rank.get(rightRoot) ?? 0
    if (leftRank < rightRank || (leftRank === rightRank && compareValues(leftRoot, rightRoot) > 0)) {
      const previousLeft = leftRoot
      leftRoot = rightRoot
      rightRoot = previousLeft
    }

    this.#parent.set(rightRoot, leftRoot)
    if (leftRank === rightRank) this.#rank.set(leftRoot, leftRank + 1)
    return true
  }

  connected(left: T, right: T): boolean {
    return this.find(left) === this.find(right)
  }

  groups(): T[][] {
    const byRoot = new Map<T, T[]>()
    for (const value of this.#parent.keys()) {
      const root = this.find(value)
      const group = byRoot.get(root)
      if (group) group.push(value)
      else byRoot.set(root, [value])
    }
    return [...byRoot.values()]
      .map((group) => group.sort(compareValues))
      .sort((left, right) => compareValues(left[0], right[0]))
  }
}

