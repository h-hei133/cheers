import type { NormalizedProviderError } from './types.js'

export interface RetryPolicy {
  readonly maxRetries: number
  readonly baseDelayMs: number
  readonly maxDelayMs: number
  readonly jitterFactor: number
}

export interface RetryState {
  attemptCount: number
  totalElapsedMs: number
  lastError?: NormalizedProviderError
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.3,
}

export function shouldRetry(
  error: NormalizedProviderError,
  state: RetryState,
  policy: RetryPolicy,
): boolean {
  if (state.attemptCount >= policy.maxRetries) {
    return false
  }

  if (!error.retriable) {
    return false
  }

  return true
}

export function calculateBackoffMs(
  state: RetryState,
  policy: RetryPolicy,
  retryAfterMs?: number,
): number {
  if (retryAfterMs != null && retryAfterMs > 0) {
    return Math.min(retryAfterMs, policy.maxDelayMs)
  }

  const exponentialDelay =
    policy.baseDelayMs * Math.pow(2, state.attemptCount)
  
  const jitter =
    exponentialDelay * policy.jitterFactor * (Math.random() * 2 - 1)
  
  const delayWithJitter = exponentialDelay + jitter

  return Math.min(Math.max(delayWithJitter, 0), policy.maxDelayMs)
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createRetryState(): RetryState {
  return {
    attemptCount: 0,
    totalElapsedMs: 0,
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  normalizeError: (error: unknown) => NormalizedProviderError,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  sleepImpl: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  const state = createRetryState()
  const startTime = Date.now()

  while (true) {
    try {
      return await operation()
    } catch (error) {
      const normalized = normalizeError(error)
      state.lastError = normalized
      state.totalElapsedMs = Date.now() - startTime

      if (!shouldRetry(normalized, state, policy)) {
        throw normalized
      }

      state.attemptCount++
      const backoffMs = calculateBackoffMs(state, policy, normalized.retryAfterMs)
      
      await sleepImpl(backoffMs)
    }
  }
}
