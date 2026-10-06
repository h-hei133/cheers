export interface WalkLimits {
  readonly entries?: number
  readonly directories?: number
  readonly pathBytes?: number
  readonly ignoreBytes?: number
  readonly rules?: number
  readonly ruleBytes?: number
  readonly depth?: number
  readonly timeoutMs?: number
}

const DEFAULTS: Required<WalkLimits> = {
  entries: 100_000, directories: 10_000, pathBytes: 16 * 1024 * 1024,
  ignoreBytes: 1024 * 1024, rules: 10_000, ruleBytes: 4 * 1024 * 1024,
  depth: 128, timeoutMs: 30_000,
}
type Counter = Exclude<keyof WalkLimits, 'depth' | 'timeoutMs'>
type Limits = { -readonly [Key in keyof WalkLimits]-?: number }

export class WalkLimitError extends Error {
  constructor(readonly reason: Counter | 'depth' | 'deadline') {
    const description = { entries: 'entry count', directories: 'directory count', pathBytes: 'path bytes',
      ignoreBytes: 'ignore file bytes', rules: 'ignore rule count', ruleBytes: 'expanded ignore rule bytes',
      depth: 'directory depth', deadline: 'elapsed time' }[reason]
    super(`Directory traversal stopped at its ${description} limit; no complete listing is available.`)
    this.name = 'WalkLimitError'
  }
}

/** One request owns one budget, including native queries and any fallback. */
export class WalkBudget {
  private readonly limits: Limits
  private readonly counts: Partial<Record<Counter, number>> = {}
  private readonly deadline: number

  constructor(private readonly signal?: AbortSignal, limits?: WalkLimits) {
    this.limits = { ...DEFAULTS }
    for (const key of Object.keys(DEFAULTS) as Array<keyof WalkLimits>) {
      const value = limits?.[key]
      if (value === undefined) continue
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('Traversal bounds must be positive safe integers.')
      this.limits[key] = Math.min(value, DEFAULTS[key])
    }
    this.deadline = performance.now() + this.limits.timeoutMs
  }

  check(): void {
    this.signal?.throwIfAborted()
    if (performance.now() >= this.deadline) throw new WalkLimitError('deadline')
  }

  take(kind: Counter, amount: number): void {
    this.check()
    const total = (this.counts[kind] ?? 0) + amount
    if (total > this.limits[kind]) throw new WalkLimitError(kind)
    this.counts[kind] = total
  }

  depth(value: number): void {
    this.check()
    if (value > this.limits.depth) throw new WalkLimitError('depth')
  }

  timeRemaining(maximum: number): number {
    this.check()
    return Math.max(1, Math.min(maximum, Math.ceil(this.deadline - performance.now())))
  }

  readAllowance(kind: Counter, maximum: number): number {
    this.check()
    // One extra byte distinguishes EOF at the exact boundary from overflow.
    return Math.min(maximum, this.limits[kind] - (this.counts[kind] ?? 0) + 1)
  }
}
