export interface ExtensionInitializationOptions {
  readonly initializationTimeoutMs?: number
  readonly signal?: AbortSignal
}

/** Registrations become visible together, and failed initialization loses its host capabilities. */
export class ExtensionInitialization {
  private state: 'collecting' | 'active' | 'retired' = 'collecting'
  private readonly cancellation = new AbortController()
  private readonly onAbort = () => this.retire()
  readonly timeoutMs: number
  get signal(): AbortSignal { return this.cancellation.signal }

  constructor(private readonly options: ExtensionInitializationOptions = {}) {
    const requested = options.initializationTimeoutMs ?? 5_000
    if (!Number.isFinite(requested) || requested <= 0) throw new Error('Extension initialization timeout must be positive and finite.')
    this.timeoutMs = Math.min(5_000, Math.max(1, Math.trunc(requested)))
    options.signal?.addEventListener('abort', this.onAbort, { once: true })
    if (options.signal?.aborted) this.retire()
  }

  assertActive(): void {
    if (this.options.signal?.aborted) this.retire()
    if (this.state === 'retired') throw new Error('Extension initialization is retired.')
  }

  assertCollecting(): void {
    this.assertActive()
    if (this.state !== 'collecting') throw new Error('Extension registration is closed.')
  }

  commit(): void {
    this.assertCollecting()
    this.state = 'active'
  }

  retire(): void {
    this.state = 'retired'
    this.options.signal?.removeEventListener('abort', this.onAbort)
    this.cancellation.abort()
  }

  async wait(pending: unknown): Promise<void> {
    const observed = Promise.resolve(pending)
    void observed.catch(() => {})
    try {
      this.assertActive()
      await new Promise<void>((resolve, reject) => {
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const finish = (success: boolean, error?: unknown) => {
          if (settled) return
          settled = true
          if (timer !== undefined) clearTimeout(timer)
          this.options.signal?.removeEventListener('abort', onAbort)
          if (!success) { this.retire(); reject(error ?? new Error('Extension initialization failed.')) }
          else resolve()
        }
        const onAbort = () => finish(false, new Error('Extension initialization cancelled.'))
        this.options.signal?.addEventListener('abort', onAbort, { once: true })
        timer = setTimeout(() => finish(false, new Error('Extension initialization timed out.')), this.timeoutMs)
        // Observe late failures even after cancellation or the deadline retires the collector.
        observed.then(() => finish(true), error => finish(false, error))
        if (this.options.signal?.aborted) onAbort()
      })
      this.commit()
    } catch (error) {
      this.retire()
      throw error
    }
  }
}
