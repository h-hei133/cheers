import type {
  ModelRequest,
  NormalizedFinishReason,
  NormalizedMessage,
  NormalizedProviderError,
  NormalizedStreamEvent,
  ProviderId,
} from '../../types.js'
import type {
  OpenAIChatCompletionsStreamChunk,
  OpenAIToolCallDelta,
} from './wireTypes.js'

const OPENAI_PROVIDER_ID: ProviderId = 'openai'

interface PartialToolCall {
  id: string
  name?: string
  argumentsBuffer: string
}

export interface OpenAIStreamMapperState {
  started: boolean
  toolCallsByIndex: Map<number, PartialToolCall>
}

export function createOpenAIStreamMapperState(): OpenAIStreamMapperState {
  return {
    started: false,
    toolCallsByIndex: new Map<number, PartialToolCall>(),
  }
}

export function mapOpenAIChunkToNormalizedEvents(
  chunk: OpenAIChatCompletionsStreamChunk,
  state: OpenAIStreamMapperState,
  provider: ProviderId = OPENAI_PROVIDER_ID,
): readonly NormalizedStreamEvent[] {
  const events: NormalizedStreamEvent[] = []
  if (!state.started) {
    state.started = true
    events.push({
      type: 'response.started',
      provider,
      model: chunk.model ?? 'unknown',
    })
  }

  for (const choice of chunk.choices ?? []) {
    const content = choice.delta?.content
    if (typeof content === 'string' && content.length > 0) {
      events.push({ type: 'content.delta', delta: content })
    }

    for (const toolDelta of choice.delta?.tool_calls ?? []) {
      const mapped = mapToolCallDelta(toolDelta, state)
      if (mapped.length > 0) {
        events.push(...mapped)
      }
    }

    if (choice.finish_reason != null) {
      const completedToolCalls = Array.from(state.toolCallsByIndex.values()).map(
        toolCall => ({
          id: toolCall.id,
          name: toolCall.name ?? 'unknown',
          argumentsJson: toolCall.argumentsBuffer,
        }),
      )
      for (const completedToolCall of completedToolCalls) {
        events.push({
          type: 'tool.call.completed',
          toolCall: completedToolCall,
        })
      }
      state.toolCallsByIndex.clear()

      events.push({
        type: 'response.completed',
        finishReason: mapFinishReason(choice.finish_reason),
        usage: chunk.usage
          ? {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            }
          : undefined,
      })
    }
  }

  return events
}

function mapToolCallDelta(
  toolDelta: OpenAIToolCallDelta,
  state: OpenAIStreamMapperState,
): readonly NormalizedStreamEvent[] {
  if (toolDelta.index == null) {
    return []
  }

  const existing = state.toolCallsByIndex.get(toolDelta.index)
  const next: PartialToolCall = existing ?? {
    id: toolDelta.id ?? `tool_${toolDelta.index}`,
    argumentsBuffer: '',
  }

  if (toolDelta.id) {
    next.id = toolDelta.id
  }
  if (toolDelta.function?.name) {
    next.name = toolDelta.function.name
  }
  if (typeof toolDelta.function?.arguments === 'string') {
    next.argumentsBuffer += toolDelta.function.arguments
  }
  state.toolCallsByIndex.set(toolDelta.index, next)

  return [
    {
      type: 'tool.call.delta',
      toolCallId: next.id,
      name: toolDelta.function?.name,
      argumentsDelta: toolDelta.function?.arguments,
    },
  ]
}

export function toOpenAIRequestBody(request: ModelRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    stream: true,
    messages: request.messages.map(toOpenAIMessage),
  }

  if (typeof request.temperature === 'number') {
    body.temperature = request.temperature
  }
  if (typeof request.maxOutputTokens === 'number') {
    body.max_tokens = request.maxOutputTokens
  }
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  return body
}

export function toCodexResponsesRequestBody(
  request: ModelRequest,
): Record<string, unknown> {
  const systemMessages = request.messages.filter((message) => message.role === 'system')
  const nonSystemMessages = request.messages.filter(
    (message) => message.role !== 'system',
  )
  const instructions = systemMessages
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n')
  const input = nonSystemMessages.map((message) => ({
    role:
      message.role === 'tool'
        ? 'assistant'
        : message.role === 'assistant'
          ? 'assistant'
          : 'user',
    content: [
      {
        type: 'input_text',
        text: message.content || ' ',
      },
    ],
  }))

  const body: Record<string, unknown> = {
    model: request.model,
    stream: true,
    store: false,
    // Codex backend requires instructions for account-auth requests.
    instructions:
      instructions || 'You are a coding assistant. Follow user instructions exactly.',
    input: input.length > 0 ? input : [{ role: 'user', content: [{ type: 'input_text', text: ' ' }] }],
  }

  // Codex backend does not accept max_output_tokens on this account-auth path.

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    }))
    body.tool_choice = 'auto'
    body.parallel_tool_calls = true
  }

  return body
}

function toOpenAIMessage(message: NormalizedMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolCallId,
    }
  }

  if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: message.content,
      tool_calls: message.toolCalls.map(toolCall => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: toolCall.argumentsJson,
        },
      })),
    }
  }

  return {
    role: message.role,
    content: message.content,
  }
}

export function normalizeOpenAIError(
  error: unknown,
  provider: ProviderId = OPENAI_PROVIDER_ID,
): NormalizedProviderError {
  const statusCode = getStatusCode(error)
  const code = getErrorCode(error)
  const message = getErrorMessage(error)
  const retryAfterMs = getRetryAfterMs(error)

  if (statusCode === 429) {
    return {
      provider,
      kind: 'rate_limit',
      message,
      retriable: true,
      statusCode,
      code,
      retryAfterMs,
      cause: error,
    }
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      provider,
      kind: 'authentication',
      message,
      retriable: false,
      statusCode,
      code,
      retryAfterMs,
      cause: error,
    }
  }

  if (statusCode != null && statusCode >= 400 && statusCode < 500) {
    return {
      provider,
      kind: 'invalid_request',
      message,
      retriable: false,
      statusCode,
      code,
      retryAfterMs,
      cause: error,
    }
  }

  if (statusCode != null && statusCode >= 500) {
    return {
      provider,
      kind: 'server',
      message,
      retriable: true,
      statusCode,
      code,
      retryAfterMs,
      cause: error,
    }
  }

  if (error instanceof TypeError) {
    return {
      provider,
      kind: 'network',
      message,
      retriable: true,
      statusCode,
      code,
      retryAfterMs,
      cause: error,
    }
  }

  return {
    provider,
    kind: 'unknown',
    message,
    retriable: false,
    statusCode,
    code,
    retryAfterMs,
    cause: error,
  }
}

function mapFinishReason(value: string): NormalizedFinishReason {
  switch (value) {
    case 'stop':
      return 'stop'
    case 'tool_calls':
      return 'tool_calls'
    case 'length':
      return 'length'
    case 'content_filter':
      return 'content_filter'
    default:
      return 'unknown'
  }
}

function getStatusCode(error: unknown): number | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status
  }
  return undefined
}

function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as { error?: unknown }).error === 'object' &&
    (error as { error: unknown }).error !== null &&
    'code' in ((error as { error: { code?: unknown } }).error) &&
    typeof ((error as { error: { code?: unknown } }).error.code) === 'string'
  ) {
    return (error as { error: { code: string } }).error.code
  }

  const cause = getErrorCause(error)
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    typeof (cause as { code?: unknown }).code === 'string'
  ) {
    return (cause as { code: string }).code
  }

  return undefined
}

function getErrorMessage(error: unknown): string {
  const message = getBaseErrorMessage(error)
  const cause = formatFetchFailureCause(error)
  return cause ? `${message} (${cause})` : message
}

function getBaseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }

  return 'Unknown provider error'
}

function getErrorCause(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error
  ) {
    return (error as { cause?: unknown }).cause
  }
  return undefined
}

function formatFetchFailureCause(error: unknown): string | undefined {
  const cause = getErrorCause(error)
  if (typeof cause !== 'object' || cause === null) {
    return undefined
  }

  const fields: string[] = []
  appendStringField(fields, cause, 'name')
  appendStringField(fields, cause, 'code')
  appendNumberField(fields, cause, 'errno')
  appendStringField(fields, cause, 'syscall')
  appendStringField(fields, cause, 'hostname')
  appendStringField(fields, cause, 'address')
  appendNumberField(fields, cause, 'port')

  if (cause instanceof Error && cause.message.trim()) {
    fields.push(`message=${sanitizeCauseField(cause.message)}`)
  }

  return fields.length > 0 ? `cause: ${fields.join(' ')}` : undefined
}

function appendStringField(
  fields: string[],
  source: object,
  key: string,
): void {
  if (
    key in source &&
    typeof (source as Record<string, unknown>)[key] === 'string' &&
    ((source as Record<string, string>)[key]).trim().length > 0
  ) {
    fields.push(`${key}=${sanitizeCauseField((source as Record<string, string>)[key])}`)
  }
}

function appendNumberField(
  fields: string[],
  source: object,
  key: string,
): void {
  if (key in source && typeof (source as Record<string, unknown>)[key] === 'number') {
    fields.push(`${key}=${String((source as Record<string, number>)[key])}`)
  }
}

function sanitizeCauseField(value: string): string {
  return value.replace(/\s+/g, '_').slice(0, 160)
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('headers' in error)
  ) {
    return undefined
  }

  const headers = (error as { headers?: unknown }).headers
  if (
    typeof headers === 'object' &&
    headers !== null &&
    'get' in headers &&
    typeof (headers as { get?: unknown }).get === 'function'
  ) {
    const retryAfter = (headers as { get(name: string): string | null }).get('retry-after')
    if (!retryAfter) {
      return undefined
    }
    const seconds = Number.parseInt(retryAfter, 10)
    if (Number.isNaN(seconds)) {
      return undefined
    }
    return seconds * 1000
  }

  return undefined
}
