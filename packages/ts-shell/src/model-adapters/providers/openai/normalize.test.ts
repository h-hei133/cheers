import { describe, expect, it } from 'vitest'
import {
  createOpenAIStreamMapperState,
  mapOpenAIChunkToNormalizedEvents,
  normalizeOpenAIError,
  toCodexResponsesRequestBody,
} from './normalize.js'

describe('openai stream normalization', () => {
  it('maps streaming content and tool-call envelope to normalized events', () => {
    const state = createOpenAIStreamMapperState()

    const firstChunkEvents = mapOpenAIChunkToNormalizedEvents(
      {
        model: 'gpt-4.1',
        choices: [
          {
            delta: {
              content: 'Hello ',
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: {
                    name: 'read_file',
                    arguments: '{"path":"C:/tmp/',
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      state,
    )

    const secondChunkEvents = mapOpenAIChunkToNormalizedEvents(
      {
        model: 'gpt-4.1',
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: {
                    arguments: 'file.txt"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
      state,
    )

    expect(firstChunkEvents).toEqual([
      {
        type: 'response.started',
        provider: 'openai',
        model: 'gpt-4.1',
      },
      {
        type: 'content.delta',
        delta: 'Hello ',
      },
      {
        type: 'tool.call.delta',
        toolCallId: 'call_1',
        name: 'read_file',
        argumentsDelta: '{"path":"C:/tmp/',
      },
    ])

    expect(secondChunkEvents).toEqual([
      {
        type: 'tool.call.delta',
        toolCallId: 'call_1',
        name: undefined,
        argumentsDelta: 'file.txt"}',
      },
      {
        type: 'tool.call.completed',
        toolCall: {
          id: 'call_1',
          name: 'read_file',
          argumentsJson: '{"path":"C:/tmp/file.txt"}',
        },
      },
      {
        type: 'response.completed',
        finishReason: 'tool_calls',
        usage: undefined,
      },
    ])
  })
})

describe('openai provider failure normalization', () => {
  it('marks 429 as retriable rate-limit error', () => {
    const headers = new Headers({ 'retry-after': '3' })
    const normalized = normalizeOpenAIError({
      status: 429,
      message: 'Too many requests',
      code: 'rate_limit_exceeded',
      headers,
    })

    expect(normalized.kind).toBe('rate_limit')
    expect(normalized.retriable).toBe(true)
    expect(normalized.retryAfterMs).toBe(3000)
  })

  it('marks 500 as retriable server error', () => {
    const normalized = normalizeOpenAIError({
      status: 500,
      message: 'Server unavailable',
      code: 'internal_error',
    })

    expect(normalized.kind).toBe('server')
    expect(normalized.retriable).toBe(true)
  })

  it('marks 401 as non-retriable authentication error', () => {
    const normalized = normalizeOpenAIError({
      status: 401,
      message: 'Invalid authentication credentials',
      code: 'invalid_api_key',
    })

    expect(normalized.kind).toBe('authentication')
    expect(normalized.retriable).toBe(false)
  })
})

describe('codex request body mapping', () => {
  it('includes instructions and input for account-auth codex endpoint', () => {
    const body = toCodexResponsesRequestBody({
      schemaVersion: '1.0.0',
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: 'You are an assistant.' },
        { role: 'user', content: 'hello' },
      ],
      maxOutputTokens: 256,
    })

    expect(body).toMatchObject({
      model: 'gpt-5.4',
      stream: true,
      store: false,
      instructions: 'You are an assistant.',
    })
    expect(body).not.toHaveProperty('max_output_tokens')
    expect(body.input).toEqual([
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'hello' }],
      },
    ])
  })
})
