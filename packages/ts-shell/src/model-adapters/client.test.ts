import { describe, expect, it, vi } from 'vitest'
import { createModelClient, type ModelClientConfig } from './client.js'
import type {
  ModelProviderAdapter,
  ModelRequest,
  NormalizedProviderError,
  NormalizedStreamEvent,
} from './types.js'

function createMockAdapter(
  streamFn: (
    request: ModelRequest,
    signal?: AbortSignal,
  ) => AsyncGenerator<NormalizedStreamEvent, void>,
): ModelProviderAdapter {
  return {
    id: 'openai',
    capabilities: {
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsJsonResponseFormat: true,
    },
    streamResponse: streamFn,
    normalizeError(error: unknown): NormalizedProviderError {
      if (error instanceof Error && error.message.includes('Rate limit')) {
        return {
          provider: 'openai',
          kind: 'rate_limit',
          message: error.message,
          retriable: true,
          statusCode: 429,
        }
      }
      if (error instanceof Error && error.message.includes('Server error')) {
        return {
          provider: 'openai',
          kind: 'server',
          message: error.message,
          retriable: true,
          statusCode: 503,
        }
      }
      return {
        provider: 'openai',
        kind: 'unknown',
        message: error instanceof Error ? error.message : 'Unknown error',
        retriable: false,
      }
    },
  }
}

async function* failStream(message: string): AsyncGenerator<NormalizedStreamEvent, void> {
  for await (const event of [] as NormalizedStreamEvent[]) {
    yield event
  }
  throw new Error(message)
}

function createBaseConfig(adapter: ModelProviderAdapter): ModelClientConfig {
  return {
    provider: 'openai',
    apiKey: 'test-key',
    adapter,
    sleepImpl: vi.fn().mockResolvedValue(undefined),
    retryPolicy: {
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 100,
      jitterFactor: 0,
    },
  }
}

describe('ModelClient fallback policy', () => {
  it('retries normalized retriable errors without downgrading them on re-entry', async () => {
    let attemptCount = 0
    const normalizedNetworkError: NormalizedProviderError = {
      provider: 'openai',
      kind: 'network',
      message: 'fetch failed',
      retriable: true,
    }
    const adapter = createMockAdapter(async function* () {
      attemptCount += 1
      if (attemptCount === 1) {
        throw normalizedNetworkError
      }
      yield { type: 'response.started', provider: 'openai', model: 'gpt-4' }
      yield { type: 'content.delta', delta: 'Recovered' }
      yield { type: 'response.completed', finishReason: 'stop' }
    })

    const client = createModelClient(createBaseConfig(adapter))
    const request: ModelRequest = {
      schemaVersion: '1.0.0',
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }],
    }

    const events: NormalizedStreamEvent[] = []
    for await (const event of client.stream(request)) {
      events.push(event)
    }

    expect(events).toHaveLength(3)
    expect(attemptCount).toBe(2)
  })

  it('retries transient failures and succeeds', async () => {
    let attemptCount = 0
    const adapter = createMockAdapter(async function* () {
      attemptCount += 1
      if (attemptCount < 3) {
        throw new Error('Rate limit exceeded')
      }
      yield { type: 'response.started', provider: 'openai', model: 'gpt-4' }
      yield { type: 'content.delta', delta: 'Success' }
      yield { type: 'response.completed', finishReason: 'stop' }
    })

    const client = createModelClient(createBaseConfig(adapter))
    const request: ModelRequest = {
      schemaVersion: '1.0.0',
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }],
    }

    const events: NormalizedStreamEvent[] = []
    for await (const event of client.stream(request)) {
      events.push(event)
    }

    expect(events).toHaveLength(3)
    expect(attemptCount).toBe(3)
  })

  it('enters degraded state after consecutive failures', async () => {
    const adapter = createMockAdapter(async function* () {
      yield* failStream('Server error')
    })

    const client = createModelClient({
      ...createBaseConfig(adapter),
      fallbackPolicy: {
        enabled: true,
        maxConsecutiveFailures: 3,
        gracefulDegradationMessage: 'Service temporarily unavailable',
      },
    })

    const request: ModelRequest = {
      schemaVersion: '1.0.0',
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }],
    }

    for (let i = 0; i < 3; i += 1) {
      await expect(
        (async () => {
          for await (const _event of client.stream(request)) {
          }
        })(),
      ).rejects.toMatchObject({ kind: 'server' })
    }

    expect(client.getProviderHealth().consecutiveFailures).toBe(3)
    expect(client.getProviderHealth().isDegraded).toBe(true)

    await expect(
      (async () => {
        for await (const _event of client.stream(request)) {
        }
      })(),
    ).rejects.toMatchObject({
      message: 'Service temporarily unavailable',
      retriable: false,
    })
  })

  it('resets health after a successful request', async () => {
    let attemptCount = 0
    const adapter = createMockAdapter(async function* () {
      attemptCount += 1
      if (attemptCount <= 2) {
        throw new Error('Server error')
      }
      yield { type: 'response.started', provider: 'openai', model: 'gpt-4' }
      yield { type: 'response.completed', finishReason: 'stop' }
    })

    const client = createModelClient({
      ...createBaseConfig(adapter),
      retryPolicy: {
        maxRetries: 1,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterFactor: 0,
      },
      fallbackPolicy: {
        enabled: true,
        maxConsecutiveFailures: 5,
      },
    })

    const request: ModelRequest = {
      schemaVersion: '1.0.0',
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }],
    }

    await expect(
      (async () => {
        for await (const _event of client.stream(request)) {
        }
      })(),
    ).rejects.toMatchObject({ kind: 'server' })

    expect(client.getProviderHealth().consecutiveFailures).toBe(1)

    const events: NormalizedStreamEvent[] = []
    for await (const event of client.stream(request)) {
      events.push(event)
    }

    expect(events).toHaveLength(2)
    expect(client.getProviderHealth().consecutiveFailures).toBe(0)
    expect(client.getProviderHealth().isDegraded).toBe(false)
  })

  it('allows manual health reset', async () => {
    const adapter = createMockAdapter(async function* () {
      yield* failStream('Server error')
    })

    const client = createModelClient({
      ...createBaseConfig(adapter),
      retryPolicy: {
        maxRetries: 0,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterFactor: 0,
      },
      fallbackPolicy: {
        enabled: true,
        maxConsecutiveFailures: 2,
      },
    })

    const request: ModelRequest = {
      schemaVersion: '1.0.0',
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }],
    }

    for (let i = 0; i < 2; i += 1) {
      await expect(
        (async () => {
          for await (const _event of client.stream(request)) {
          }
        })(),
      ).rejects.toMatchObject({ kind: 'server' })
    }

    expect(client.getProviderHealth().isDegraded).toBe(true)
    client.resetProviderHealth()
    expect(client.getProviderHealth()).toEqual({
      consecutiveFailures: 0,
      isDegraded: false,
      lastError: undefined,
    })
  })

  it('respects abort signal during retry', async () => {
    const adapter = createMockAdapter(async function* (_request, signal) {
      for await (const event of [] as NormalizedStreamEvent[]) {
        yield event
      }
      if (signal?.aborted) {
        throw new Error('Rate limit exceeded')
      }
      throw new Error('Rate limit exceeded')
    })

    const client = createModelClient({
      ...createBaseConfig(adapter),
      retryPolicy: {
        maxRetries: 10,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterFactor: 0,
      },
      sleepImpl: async () => undefined,
    })

    const request: ModelRequest = {
      schemaVersion: '1.0.0',
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'test' }],
    }

    const abortController = new AbortController()
    abortController.abort()

    await expect(
      (async () => {
        for await (const _event of client.stream(request, abortController.signal)) {
        }
      })(),
    ).rejects.toMatchObject({ kind: 'rate_limit' })
  })
})
