import type { MultimodalContentBlock } from './multimodal.js';
import { isRecord } from '../core/values/record.js';
import type { RequestDeclaration } from '../core/agent/declarations/model.js';
import { captureRequestDeclaration } from '../core/agent/declarations/codec.js';
import { THINKING_LEVELS, type ThinkingLevel } from '../core/models/effort.js';

export type MessageContent = string | readonly MultimodalContentBlock[];

/** Validate inert, already captured content before a consumer dereferences it. */
export function isMessageContent(value: unknown): value is MessageContent {
  return typeof value === 'string' || (Array.isArray(value) && value.every(block => isRecord(block) && (
    (block.type === 'text' && typeof block.text === 'string') ||
    (block.type === 'image' && typeof block.data === 'string' && typeof block.mimeType === 'string')
  )));
}

export interface ProviderToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

/** A model answer's captured provider and credential replay identity. */
export interface MessageOrigin {
  readonly provider?: string;
  readonly model: string;
  readonly replayBinding?: string;
  readonly thinkingLevel?: ThinkingLevel;
}

/** Reasoning stays separate from the answer and retains the provider's opaque signature. */
export interface MessageReasoning {
  readonly text: string;
  readonly signature?: string;
  /** Withheld reasoning must return as the provider's original redacted block. */
  readonly redacted?: boolean;
}

/** Standard messages accepted by provider projection, without session or agent state. */
export interface ProviderMessage {
  /** Declaration markers retain their captured identity until protocol projection. */
  readonly id?: string;
  readonly requestDeclaration?: RequestDeclaration;
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  /** Text or text with images; protocols may omit content for tool calls. */
  readonly content?: MessageContent | null;
  readonly tool_calls?: readonly ProviderToolCall[];
  readonly tool_call_id?: string;
  /** Absent origin preserves compatibility with unattributed historical answers. */
  readonly origin?: MessageOrigin;
  /** Endpoints that require signed reasoning return this unchanged. */
  readonly reasoning?: MessageReasoning;
}

/** The provider boundary accepts only the standard roles and captured protocol fields. */
export function isProviderMessage(value: unknown): value is ProviderMessage {
  if (!isRecord(value) || typeof value.role !== 'string' || !['system', 'user', 'assistant', 'tool'].includes(value.role)
    || (value.content !== undefined && value.content !== null && !isMessageContent(value.content))) return false;
  try { captureRequestDeclaration(value as Record<string, unknown> & { role: string }); }
  catch { return false; }
  const calls = value.tool_calls, origin = value.origin, reasoning = value.reasoning;
  return (calls === undefined || (value.role === 'assistant' && Array.isArray(calls) && calls.every(call =>
    isRecord(call) && typeof call.id === 'string' && call.id.length > 0 && call.type === 'function'
    && isRecord(call.function) && typeof call.function.name === 'string' && call.function.name.length > 0
    && typeof call.function.arguments === 'string')))
    && (value.tool_call_id === undefined || (value.role === 'tool' && typeof value.tool_call_id === 'string' && value.tool_call_id.length > 0))
    && (value.role !== 'tool' || typeof value.tool_call_id === 'string' && value.tool_call_id.length > 0)
    && (origin === undefined || (isRecord(origin) && typeof origin.model === 'string'
      && (origin.provider === undefined || typeof origin.provider === 'string')
      && (origin.replayBinding === undefined || typeof origin.replayBinding === 'string' && /^[a-f0-9]{64}$/.test(origin.replayBinding))
      && (origin.thinkingLevel === undefined || THINKING_LEVELS.includes(origin.thinkingLevel as ThinkingLevel))))
    && (reasoning === undefined || (value.role === 'assistant' && isRecord(reasoning) && typeof reasoning.text === 'string'
      && (reasoning.signature === undefined || typeof reasoning.signature === 'string')
      && (reasoning.redacted === undefined || typeof reasoning.redacted === 'boolean')));
}
