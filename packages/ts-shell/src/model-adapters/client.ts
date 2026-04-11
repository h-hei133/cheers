import { createModelProviderAdapter } from './registry.js'
import { createComponentLogger, recordCount, recordTiming } from '../observability/index.js'
import {
  calculateBackoffMs,
  createRetryState,
  DEFAULT_RETRY_POLICY,
  shouldRetry,
  sleep,
  type RetryPolicy,
  type RetryState,
} from './retryPolicy.js'
import { negotiateCapabilities, type ProviderCapabilities } from './types.js'
import type {
  ModelProviderAdapter,
  ModelProviderConfig,
  ModelRequest,
  NormalizedProviderError,
  NormalizedStreamEvent,
} from './types.js'

export interface FallbackPolicy {
  readonly enabled: boolean
  readonly maxConsecutiveFailures: number
  readonly gracefulDegradationMessage?: string
}

export interface ModelClientConfig extends ModelProviderConfig {
  readonly retryPolicy?: RetryPolicy
  readonly fallbackPolicy?: FallbackPolicy
  readonly requestedCapabilities?: Partial<ProviderCapabilities>
  readonly adapter?: ModelProviderAdapter
  readonly sleepImpl?: (ms: number) => Promise<void>
}

const DEFAULT_FALLBACK_POLICY: FallbackPolicy = {
  enabled: true,
  maxConsecutiveFailures: 5,
  gracefulDegradationMessage: 'Provider temporarily unavailable',
}

export interface ModelClient {
  readonly capabilities: ProviderCapabilities
  stream(
    request: ModelRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<NormalizedStreamEvent, void>
  normalizeError(error: unknown): NormalizedProviderError
  getProviderHealth(): ProviderHealthStatus
  resetProviderHealth(): void
}

export interface ProviderHealthStatus {
  readonly consecutiveFailures: number
  readonly isDegraded: boolean
  readonly lastError?: NormalizedProviderError
}

export function createModelClient(config: ModelClientConfig): ModelClient {
  const adapter = config.adapter ?? createModelProviderAdapter(config)
  const retryPolicy = config.retryPolicy ?? DEFAULT_RETRY_POLICY
  const fallbackPolicy = config.fallbackPolicy ?? DEFAULT_FALLBACK_POLICY
  const sleepImpl = config.sleepImpl ?? sleep
  const logger = createComponentLogger('provider-client')

  const negotiatedCapabilities = config.requestedCapabilities
    ? negotiateCapabilities(config.requestedCapabilities, adapter.capabilities)
    : adapter.capabilities

  let consecutiveFailures = 0
  let lastError: NormalizedProviderError | undefined

  function isDegraded(): boolean {
    return (
      fallbackPolicy.enabled &&
      consecutiveFailures >= fallbackPolicy.maxConsecutiveFailures
    )
  }

  async function* streamWithRetry(
    request: ModelRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<NormalizedStreamEvent, void> {
    const state = createRetryState()
    const startTime = Date.now()

    while (true) {
      try {
        const attemptStart = Date.now()
        for await (const event of adapter.streamResponse(request, signal)) {
          yield event
        }
        consecutiveFailures = 0
        lastError = undefined
        recordTiming('provider.request.ms', Date.now() - attemptStart, { provider: adapter.id })
        logger.info('Provider request succeeded', { provider: adapter.id, attempt: state.attemptCount + 1 })
        return
      } catch (error) {
        const normalized = adapter.normalizeError(error)
        state.lastError = normalized
        state.totalElapsedMs = Date.now() - startTime
        lastError = normalized

        if (!shouldRetry(normalized, state, retryPolicy)) {
          consecutiveFailures++
          recordCount('provider.failures', 1, { provider: adapter.id, kind: normalized.kind })
          if (isDegraded()) {
            const degradedError: NormalizedProviderError = {
              provider: normalized.provider,
              kind: 'server',
              message:
                fallbackPolicy.gracefulDegradationMessage ??
                DEFAULT_FALLBACK_POLICY.gracefulDegradationMessage!,
              retriable: false,
              cause: normalized,
            }
            lastError = degradedError
            logger.error('Provider entered degraded mode', { provider: adapter.id })
            throw degradedError
          }
          logger.warn('Provider request failed without retry', {
            provider: adapter.id,
            kind: normalized.kind,
          })
          throw normalized
        }

        if (signal?.aborted) {
          logger.warn('Provider retry aborted', { provider: adapter.id })
          throw normalized
        }

        state.attemptCount++
        const backoffMs = calculateBackoffMs(
          state,
          retryPolicy,
          normalized.retryAfterMs,
        )

        logger.info('Retrying provider request', {
          provider: adapter.id,
          attempt: state.attemptCount,
          backoffMs,
        })
        await sleepImpl(backoffMs)
      }
    }
  }

  return {
    capabilities: negotiatedCapabilities,
    stream(request: ModelRequest, signal?: AbortSignal) {
      return streamWithRetry(request, signal)
    },
    normalizeError(error: unknown) {
      return adapter.normalizeError(error)
    },
    getProviderHealth(): ProviderHealthStatus {
      return {
        consecutiveFailures,
        isDegraded: isDegraded(),
        lastError,
      }
    },
    resetProviderHealth() {
      consecutiveFailures = 0
      lastError = undefined
    },
  }
}
