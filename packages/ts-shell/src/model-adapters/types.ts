import type { SchemaVersion } from '../../../../contracts/typescript/types.js'
import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
} from '../config/runtimeConfig.js'

export type ProviderId =
  | 'openai'
  | 'anthropic'
  | 'openai-compatible'
  | 'google'
  | 'antigravity'
  | 'claudecode'

export interface ProviderCapabilities {
  readonly supportsStreaming: boolean
  readonly supportsToolCalls: boolean
  readonly supportsJsonResponseFormat: boolean
  readonly maxOutputTokens?: number
  readonly maxInputTokens?: number
  readonly supportedModalities?: readonly ('text' | 'image' | 'audio' | 'video')[]
  readonly supportsVision?: boolean
  readonly supportsFunctionCalling?: boolean
}

export function negotiateCapabilities(
  requested: Partial<ProviderCapabilities>,
  available: ProviderCapabilities,
): ProviderCapabilities {
  return {
    supportsStreaming:
      requested.supportsStreaming !== false && available.supportsStreaming,
    supportsToolCalls:
      requested.supportsToolCalls !== false && available.supportsToolCalls,
    supportsJsonResponseFormat:
      requested.supportsJsonResponseFormat !== false &&
      available.supportsJsonResponseFormat,
    maxOutputTokens:
      requested.maxOutputTokens != null
        ? Math.min(requested.maxOutputTokens, available.maxOutputTokens ?? Infinity)
        : available.maxOutputTokens,
    maxInputTokens:
      requested.maxInputTokens != null
        ? Math.min(requested.maxInputTokens, available.maxInputTokens ?? Infinity)
        : available.maxInputTokens,
    supportedModalities: available.supportedModalities,
    supportsVision: available.supportsVision,
    supportsFunctionCalling: available.supportsFunctionCalling,
  }
}

export interface ModelProviderConfig {
  readonly provider: ProviderId
  readonly baseUrl?: string
  readonly apiKey?: string
  readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig
}

export type NormalizedMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface NormalizedToolCall {
  readonly id: string
  readonly name: string
  readonly argumentsJson: string
}

export interface NormalizedMessage {
  readonly role: NormalizedMessageRole
  readonly content: string
  readonly toolCallId?: string
  readonly toolCalls?: readonly NormalizedToolCall[]
}

export interface ToolDefinition {
  readonly name: string
  readonly description?: string
  readonly inputSchema: Record<string, unknown>
}

export interface ModelRequest {
  readonly schemaVersion: SchemaVersion
  readonly model: string
  readonly messages: readonly NormalizedMessage[]
  readonly tools?: readonly ToolDefinition[]
  readonly temperature?: number
  readonly maxOutputTokens?: number
}

export type NormalizedFinishReason =
  | 'stop'
  | 'tool_calls'
  | 'length'
  | 'content_filter'
  | 'unknown'

export interface NormalizedUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly totalTokens?: number
}

export type NormalizedStreamEvent =
  | {
      readonly type: 'response.started'
      readonly provider: ProviderId
      readonly model: string
    }
  | {
      readonly type: 'content.delta'
      readonly delta: string
    }
  | {
      readonly type: 'tool.call.delta'
      readonly toolCallId: string
      readonly name?: string
      readonly argumentsDelta?: string
    }
  | {
      readonly type: 'tool.call.completed'
      readonly toolCall: NormalizedToolCall
    }
  | {
      readonly type: 'response.completed'
      readonly finishReason: NormalizedFinishReason
      readonly usage?: NormalizedUsage
    }

export type NormalizedErrorKind =
  | 'rate_limit'
  | 'authentication'
  | 'invalid_request'
  | 'server'
  | 'network'
  | 'unknown'

export interface NormalizedProviderError {
  readonly provider: ProviderId
  readonly kind: NormalizedErrorKind
  readonly message: string
  readonly retriable: boolean
  readonly statusCode?: number
  readonly code?: string
  readonly retryAfterMs?: number
  readonly cause?: unknown
}

export interface ModelProviderAdapter {
  readonly id: ProviderId
  readonly capabilities: ProviderCapabilities
  streamResponse(
    request: ModelRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<NormalizedStreamEvent, void>
  normalizeError(error: unknown): NormalizedProviderError
}
