import { describe, expect, it } from 'vitest'
import { OpenAIModelAdapter } from './OpenAIModelAdapter.js'
import {
  createOpenAIStreamMapperState,
  mapOpenAIChunkToNormalizedEvents,
  normalizeOpenAIError,
} from './normalize.js'

describe('OpenAI model adapter', () => {
  it('normalizes streaming chunks and tool call events', () => {
    const state = createOpenAIStreamMapperState()

    const events = [
      ...mapOpenAIChunkToNormalizedEvents(
        {
          model: 'gpt-4.1-mini',
          choices: [
            {
              delta: {
                content: 'Hello',
                tool_calls: [
                  {
                    index: 0,
                    id: 'tool_1',
                    function: { name: 'readFile', arguments: '{"path":"a"' },
                  },
                ],
              },
            },
          ],
        },
        state,
      ),
      ...mapOpenAIChunkToNormalizedEvents(
        {
          model: 'gpt-4.1-mini',
          choices: [
            {
              finish_reason: 'tool_calls',
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '}' },
                  },
                ],
              },
              index: 0,
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        },
        state,
      ),
    ]

    expect(events).toEqual([
      { type: 'response.started', provider: 'openai', model: 'gpt-4.1-mini' },
      { type: 'content.delta', delta: 'Hello' },
      {
        type: 'tool.call.delta',
        toolCallId: 'tool_1',
        name: 'readFile',
        argumentsDelta: '{"path":"a"',
      },
      {
        type: 'tool.call.delta',
        toolCallId: 'tool_1',
        name: undefined,
        argumentsDelta: '}',
      },
      {
        type: 'tool.call.completed',
        toolCall: {
          id: 'tool_1',
          name: 'readFile',
          argumentsJson: '{"path":"a"}',
        },
      },
      {
        type: 'response.completed',
        finishReason: 'tool_calls',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
    ])
  })

  it('classifies rate limit and authentication failures', () => {
    expect(
      normalizeOpenAIError({
        status: 429,
        message: 'Too many requests',
        headers: new Headers({ 'retry-after': '2' }),
      }),
    ).toMatchObject({
      provider: 'openai',
      kind: 'rate_limit',
      retriable: true,
      retryAfterMs: 2000,
    })

    expect(
      normalizeOpenAIError({
        status: 401,
        message: 'Bad API key',
      }),
    ).toMatchObject({
      provider: 'openai',
      kind: 'authentication',
      retriable: false,
    })
  })

  it('streams normalized events from SSE responses', async () => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"model":"gpt-4.1-mini","choices":[{"delta":{"content":"Hi"}}]}\n\n',
          ),
        )
        controller.enqueue(
          encoder.encode(
            'data: {"model":"gpt-4.1-mini","choices":[{"finish_reason":"stop","delta":{}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n',
          ),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    const adapter = new OpenAIModelAdapter(
      { provider: 'openai', apiKey: 'test-key' },
      async () =>
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    )

    const events: unknown[] = []
    for await (const event of adapter.streamResponse({
      schemaVersion: '1.0.0',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'response.started', provider: 'openai', model: 'gpt-4.1-mini' },
      { type: 'content.delta', delta: 'Hi' },
      {
        type: 'response.completed',
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
    ])
  })

  it('surfaces openai-compatible chat request diagnostics without exposing secrets', async () => {
    const calls: Array<{
      url: string
      authorization?: string
      model?: string
    }> = []
    const networkCause = Object.assign(
      new Error('getaddrinfo ENOTFOUND api.siliconflow.cn'),
      {
        code: 'ENOTFOUND',
        errno: -3008,
        syscall: 'getaddrinfo',
        hostname: 'api.siliconflow.cn',
      },
    )
    const adapter = new OpenAIModelAdapter(
      {
        provider: 'openai-compatible',
        apiKey: 'sk-siliconflow-secret',
        baseUrl: 'https://api.siliconflow.cn/v1',
      },
      async (input, init) => {
        calls.push({
          url: String(input),
          authorization:
            typeof init?.headers === 'object' && init.headers !== null
              ? (init.headers as Record<string, string>).authorization
              : undefined,
          model:
            typeof init?.body === 'string'
              ? (JSON.parse(init.body) as { model?: string }).model
              : undefined,
        })
        throw new TypeError('fetch failed', { cause: networkCause })
      },
    )

    await expect(async () => {
      for await (const _event of adapter.streamResponse({
        schemaVersion: '1.0.0',
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        messages: [{ role: 'user', content: 'hello / 你是什么模型' }],
      })) {
        // Drain stream to force the request.
      }
    }).rejects.toMatchObject({
      provider: 'openai-compatible',
      kind: 'network',
      code: 'ENOTFOUND',
      message: expect.stringContaining('cause:'),
    })

    expect(calls).toEqual([
      {
        url: 'https://api.siliconflow.cn/v1/chat/completions',
        authorization: 'Bearer sk-siliconflow-secret',
        model: 'deepseek-ai/DeepSeek-V4-Flash',
      },
    ])
  })

  it('uses codex endpoint for account-auth and emits response text', async () => {
    const calls: Array<{ url: string; body?: string }> = []
    const encoder = new TextEncoder()
    const sseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"type":"response.created","response":{"id":"resp_1","created_at":1,"model":"gpt-5.4"}}\n\n',
          ),
        )
        controller.enqueue(
          encoder.encode(
            'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Hello from codex"}\n\n',
          ),
        )
        controller.enqueue(
          encoder.encode(
            'data: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
          ),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    const adapter = new OpenAIModelAdapter(
      {
        provider: 'openai',
        accountAuth: {
          type: 'openai-chatgpt-account',
          accessToken: 'acct-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 3600_000,
        },
      },
      async (input, init) => {
        calls.push({
          url: String(input),
          body: typeof init?.body === 'string' ? init.body : undefined,
        })
        return new Response(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      },
    )

    const events: unknown[] = []
    for await (const event of adapter.streamResponse({
      schemaVersion: '1.0.0',
      model: 'gpt-5.4',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(event)
    }

    expect(calls[0]?.url).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(calls[0]?.body).toContain('"instructions"')
    expect(calls[0]?.body).toContain('"store":false')
    expect(events).toEqual([
      { type: 'response.started', provider: 'openai', model: 'gpt-5.4' },
      { type: 'content.delta', delta: 'Hello from codex' },
      { type: 'response.completed', finishReason: 'stop' },
    ])
  })
})
