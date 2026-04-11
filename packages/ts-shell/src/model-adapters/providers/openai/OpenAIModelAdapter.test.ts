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
})
