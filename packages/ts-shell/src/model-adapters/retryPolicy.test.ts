import { describe, expect, it, vi } from 'vitest'
import {
  calculateBackoffMs,
  createRetryState,
  DEFAULT_RETRY_POLICY,
  shouldRetry,
  sleep,
  withRetry,
  type RetryPolicy,
  type RetryState,
} from './retryPolicy.js'
import type { NormalizedProviderError } from './types.js'

describe('RetryPolicy', () => {
  describe('shouldRetry', () => {
    it('does not retry if max retries are exceeded', () => {
      const error: NormalizedProviderError = {
        provider: 'openai',
        kind: 'rate_limit',
        message: 'Rate limited',
        retriable: true,
      }
      const state: RetryState = {
        attemptCount: 3,
        totalElapsedMs: 5000,
        lastError: error,
      }

      expect(shouldRetry(error, state, { ...DEFAULT_RETRY_POLICY, maxRetries: 3 })).toBe(false)
    })

    it('does not retry non-retriable errors', () => {
      const error: NormalizedProviderError = {
        provider: 'openai',
        kind: 'authentication',
        message: 'Invalid API key',
        retriable: false,
      }

      expect(shouldRetry(error, createRetryState(), DEFAULT_RETRY_POLICY)).toBe(false)
    })

    it('retries retriable errors within limit', () => {
      const error: NormalizedProviderError = {
        provider: 'openai',
        kind: 'rate_limit',
        message: 'Rate limited',
        retriable: true,
      }
      const state: RetryState = { attemptCount: 1, totalElapsedMs: 1000 }

      expect(shouldRetry(error, state, DEFAULT_RETRY_POLICY)).toBe(true)
    })
  })

  describe('calculateBackoffMs', () => {
    it('respects retryAfterMs from provider', () => {
      expect(calculateBackoffMs(createRetryState(), DEFAULT_RETRY_POLICY, 5000)).toBe(5000)
    })

    it('caps retryAfterMs to maxDelayMs', () => {
      expect(
        calculateBackoffMs(createRetryState(), { ...DEFAULT_RETRY_POLICY, maxDelayMs: 10000 }, 60000),
      ).toBe(10000)
    })

    it('uses exponential backoff without retryAfterMs', () => {
      const state: RetryState = { attemptCount: 2, totalElapsedMs: 0 }
      const policy: RetryPolicy = {
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        maxRetries: 5,
        jitterFactor: 0,
      }

      expect(calculateBackoffMs(state, policy)).toBe(4000)
    })
  })

  describe('sleep', () => {
    it('resolves after the requested interval', async () => {
      const start = Date.now()
      await sleep(20)
      expect(Date.now() - start).toBeGreaterThanOrEqual(15)
    })
  })

  describe('withRetry', () => {
    const immediateSleep = vi.fn().mockResolvedValue(undefined)

    it('succeeds on the first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success')
      const normalizeError = vi.fn()

      await expect(withRetry(operation, normalizeError, DEFAULT_RETRY_POLICY, immediateSleep)).resolves.toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
      expect(normalizeError).not.toHaveBeenCalled()
    })

    it('retries a retriable error and eventually succeeds', async () => {
      let attempts = 0
      const operation = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error('Transient failure')
        }
        return 'success'
      })

      const normalizeError = vi.fn().mockReturnValue({
        provider: 'openai',
        kind: 'server',
        message: 'Server error',
        retriable: true,
      })

      await expect(
        withRetry(
          operation,
          normalizeError,
          { maxRetries: 5, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0 },
          immediateSleep,
        ),
      ).resolves.toBe('success')

      expect(operation).toHaveBeenCalledTimes(3)
    })

    it('throws non-retriable errors immediately', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Auth failed'))
      const normalizeError = vi.fn().mockReturnValue({
        provider: 'openai',
        kind: 'authentication',
        message: 'Invalid API key',
        retriable: false,
      })

      await expect(withRetry(operation, normalizeError, DEFAULT_RETRY_POLICY, immediateSleep)).rejects.toMatchObject({
        kind: 'authentication',
        retriable: false,
      })
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('throws after max retries are exceeded', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Server error'))
      const normalizeError = vi.fn().mockReturnValue({
        provider: 'openai',
        kind: 'server',
        message: 'Server error',
        retriable: true,
      })

      await expect(
        withRetry(
          operation,
          normalizeError,
          { maxRetries: 2, baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0 },
          immediateSleep,
        ),
      ).rejects.toMatchObject({ kind: 'server', retriable: true })

      expect(operation).toHaveBeenCalledTimes(3)
    })

    it('uses retryAfterMs when present', async () => {
      let attempts = 0
      const operation = vi.fn().mockImplementation(async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('Rate limited')
        }
        return 'success'
      })

      const normalizeError = vi.fn().mockReturnValue({
        provider: 'openai',
        kind: 'rate_limit',
        message: 'Rate limited',
        retriable: true,
        retryAfterMs: 3000,
      })

      await expect(
        withRetry(
          operation,
          normalizeError,
          { maxRetries: 5, baseDelayMs: 100, maxDelayMs: 30000, jitterFactor: 0 },
          immediateSleep,
        ),
      ).resolves.toBe('success')

      expect(operation).toHaveBeenCalledTimes(2)
      expect(immediateSleep).toHaveBeenCalled()
    })
  })
})
