import {
  createOpenAIStreamMapperState,
  mapOpenAIChunkToNormalizedEvents,
  normalizeOpenAIError,
  toOpenAIRequestBody,
} from './normalize.js'
import { createComponentLogger, recordCount } from '../../../observability/index.js'
import type { OpenAIChatCompletionsStreamChunk } from './wireTypes.js'
import type {
  ModelProviderAdapter,
  ModelProviderConfig,
  ModelRequest,
  NormalizedProviderError,
  NormalizedStreamEvent,
  ProviderCapabilities,
} from '../../types.js'

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

export class OpenAIModelAdapter implements ModelProviderAdapter {
  readonly id = 'openai' as const
  private readonly logger = createComponentLogger('provider-openai')

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsJsonResponseFormat: true,
  }

  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly fetchImpl: typeof fetch

  constructor(config: ModelProviderConfig, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = config.baseUrl ?? DEFAULT_OPENAI_BASE_URL
    this.apiKey = config.apiKey
    this.fetchImpl = fetchImpl
  }

  async *streamResponse(
    request: ModelRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<NormalizedStreamEvent, void> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(toOpenAIRequestBody(request)),
        signal,
      })

      if (!response.ok) {
        const errorBody = await safeReadText(response)
        this.logger.warn('OpenAI request failed', { status: response.status })
        recordCount('provider.http_errors', 1, { provider: 'openai', status: String(response.status) })
        throw {
          status: response.status,
          message: errorBody || `OpenAI request failed with status ${response.status}`,
          headers: response.headers,
        }
      }

      const body = response.body
      if (!body) {
        throw new Error('OpenAI streaming response missing body')
      }

      this.logger.info('OpenAI streaming request started', { baseUrl: this.baseUrl })

      const state = createOpenAIStreamMapperState()
      const decoder = new TextDecoder()
      let pending = ''
      const reader = body.getReader()

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        if (!value) {
          continue
        }

        pending += decoder.decode(value, { stream: true })

        while (true) {
          const separatorIndex = pending.indexOf('\n\n')
          if (separatorIndex === -1) {
            break
          }

          const frame = pending.slice(0, separatorIndex)
          pending = pending.slice(separatorIndex + 2)

          const dataLines = frame
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice('data:'.length).trim())

          for (const dataLine of dataLines) {
            if (!dataLine || dataLine === '[DONE]') {
              continue
            }

            const parsed = JSON.parse(dataLine) as OpenAIChatCompletionsStreamChunk
            const events = mapOpenAIChunkToNormalizedEvents(parsed, state)
            for (const event of events) {
              yield event
            }
          }
        }
      }
      this.logger.info('OpenAI streaming request completed', { model: request.model })
    } catch (error) {
      this.logger.error('OpenAI request errored', {
        message: error instanceof Error ? error.message : String(error),
      })
      throw this.normalizeError(error)
    }
  }

  normalizeError(error: unknown): NormalizedProviderError {
    return normalizeOpenAIError(error)
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch (error) {
    console.warn(
      `Failed to read OpenAI error response body: ${error instanceof Error ? error.message : String(error)}`,
    )
    return ''
  }
}
