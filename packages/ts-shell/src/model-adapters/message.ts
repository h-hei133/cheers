import type { MultimodalContentBlock } from './multimodal.js';
import { isRecord } from '../core/values/record.js';

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
