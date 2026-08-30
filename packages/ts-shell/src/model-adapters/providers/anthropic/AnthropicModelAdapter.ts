import type {
  ModelProviderAdapter,
  ModelProviderConfig,
  ModelRequest,
  NormalizedProviderError,
  NormalizedStreamEvent,
  ProviderCapabilities,
} from '../../types.js'
import { createProviderFetchFromEnv } from '../../../provider/request/fetch.js'

export class AnthropicModelAdapter implements ModelProviderAdapter {
  readonly id = 'anthropic'

  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsJsonResponseFormat: false,
    maxOutputTokens: 8192,
    maxInputTokens: 200000,
    supportedModalities: ['text', 'image'],
    supportsVision: true,
    supportsFunctionCalling: true,
  }

  private readonly baseUrl: string
  private readonly apiKey?: string
  private readonly fetchImpl: typeof fetch

  constructor(
    config: ModelProviderConfig,
    fetchImpl: typeof fetch = createProviderFetchFromEnv(),
  ) {
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1'
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY
    this.fetchImpl = fetchImpl
  }

  async *streamResponse(
    request: ModelRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<NormalizedStreamEvent, void> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/messages`
    const model = request.model || 'claude-3-5-sonnet-20241022'

    yield {
      type: 'response.started',
      provider: 'anthropic',
      model,
    }

    const systemMessages = request.messages.filter((m) => m.role === 'system')
    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n')

    const anthropicMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result' as const,
                tool_use_id: m.toolCallId || 'unknown_call',
                content: m.content,
              },
            ],
          }
        }

        if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
          const contentBlocks: Array<
            | { type: 'text'; text: string }
            | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
          > = []
          if (m.content) {
            contentBlocks.push({ type: 'text', text: m.content })
          }
          for (const tc of m.toolCalls) {
            let parsedArgs: Record<string, unknown> = {}
            try {
              parsedArgs = JSON.parse(tc.argumentsJson || '{}')
            } catch {
              parsedArgs = {}
            }
            contentBlocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: parsedArgs,
            })
          }
          return {
            role: 'assistant' as const,
            content: contentBlocks,
          }
        }

        return {
          role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: m.content,
        }
      })

    const anthropicTools = (request.tools || []).map((t, idx, arr) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
      // Annotate the last tool definition with ephemeral cache breakpoint
      ...(idx === arr.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
    }))

    const systemBlock = systemPrompt
      ? [
          {
            type: 'text' as const,
            text: systemPrompt,
            cache_control: { type: 'ephemeral' as const },
          },
        ]
      : undefined

    const payload: Record<string, unknown> = {
      model,
      max_tokens: request.maxOutputTokens || 4096,
      messages: anthropicMessages,
      ...(systemBlock ? { system: systemBlock } : {}),
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
      ...(request.temperature != null ? { temperature: request.temperature } : {}),
    }

    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        signal,
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Anthropic HTTP ${res.status}: ${errorText.slice(0, 300)}`)
      }

      const data = (await res.json()) as {
        id?: string
        model?: string
        content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
        usage?: { input_tokens?: number; output_tokens?: number }
      }

      for (const block of data.content || []) {
        if (block.type === 'text' && block.text) {
          yield {
            type: 'content.delta',
            delta: block.text,
          }
        } else if (block.type === 'tool_use' && block.name) {
          const callId = block.id || `call_${Math.random().toString(36).slice(2, 9)}`
          const argsJson = JSON.stringify(block.input || {})
          yield {
            type: 'tool.call.delta',
            toolCallId: callId,
            name: block.name,
            argumentsDelta: argsJson,
          }
          yield {
            type: 'tool.call.completed',
            toolCall: {
              id: callId,
              name: block.name,
              argumentsJson: argsJson,
            },
          }
        }
      }

      yield {
        type: 'response.completed',
        finishReason: 'stop',
        usage: {
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
          totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        },
      }
    } catch (err) {
      throw this.normalizeError(err)
    }
  }

  normalizeError(error: unknown): NormalizedProviderError {
    const message = error instanceof Error ? error.message : String(error)
    return {
      provider: 'anthropic',
      kind: 'network',
      message,
      retriable: true,
    }
  }
}
