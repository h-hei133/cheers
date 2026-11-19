import { isDeepStrictEqual } from 'node:util';
import type { AgentMessage, StandardAgentMessage } from './state.js';
import { captureMessageHistory } from './custom.js';
import { snapshotData } from '../values/data.js';
import { isProviderMessage, type ProviderMessage } from '../../model-adapters/message.js';
import { assertDeclarationHistory } from './declarations/history.js';
import { callbackCancellation, captureCallbackResult } from '../values/promise.js';

/**
 * Convert application history for one request without rewriting durable source.
 * Async results must be unmodified native Promises; subclasses and custom thenables
 * are refused before application hooks run. The caller owns rejection of refused
 * Promise shapes; supported pending work remains observed after cancellation.
 */
export type MessageConverter = (messages: readonly AgentMessage[], signal?: AbortSignal) =>
  readonly ProviderMessage[] | Promise<readonly ProviderMessage[]>;

export interface MessageProjection {
  readonly messages: readonly StandardAgentMessage[];
  /** Captured raw history for ownership checks, independently of provider conversion. */
  readonly sourceMessages?: readonly AgentMessage[];
  readonly providerMessages?: readonly ProviderMessage[];
}

const LIMITS = { bytes: 64 * 1024 * 1024, nodes: 250_000, depth: 48 } as const;

/** Preserve the ordinary identity path; capture both sides of any application conversion. */
export async function convertMessages(messages: readonly AgentMessage[], converter?: MessageConverter, signal?: AbortSignal, reuse?: MessageProjection): Promise<MessageProjection> {
  signal?.throwIfAborted();
  let captured: readonly AgentMessage[];
  try {
    const admitted = captureMessageHistory(messages);
    if (!converter && admitted.every((message): message is StandardAgentMessage => message.role !== 'custom')) {
      assertDeclarationHistory(admitted, admitted);
      return { messages: admitted.some(message => message.requestDeclaration) ? admitted : messages as readonly StandardAgentMessage[] };
    }
    captured = snapshotData(admitted, LIMITS) as unknown as readonly AgentMessage[];
  } catch { throw new Error('Message conversion requires bounded inert history.'); }
  // A retry reuses the exact capture; a prepared replacement is a new request.
  if (reuse?.sourceMessages && isDeepStrictEqual(captured, reuse.sourceMessages)) return reuse;
  let converted: unknown;
  if (converter) converted = (await callConverter(converter, captured, signal)).value;
  else converted = captured.map(message => message.role === 'custom' ? { role: 'user', content: message.content } : message);
  signal?.throwIfAborted();
  try {
    const providerMessages = captureProviderMessages(converted);
    assertDeclarationHistory(captured, providerMessages);
    const projected = providerMessages.map(message => Object.freeze({ ...message, content: message.content ?? '' }));
    return Object.freeze({ messages: Object.freeze(projected), sourceMessages: captured, providerMessages });
  } catch { throw new Error('Message conversion returned invalid provider messages.'); }
}

/** Cancellation releases the request even when application work settles much later. */
function callConverter(converter: MessageConverter, messages: readonly AgentMessage[], signal?: AbortSignal): Promise<{ readonly value: readonly ProviderMessage[] }> {
  signal?.throwIfAborted();
  return captureCallbackResult(() => converter(messages, signal), captureProviderMessages, {
    cancellation: callbackCancellation(signal),
    check: () => signal?.throwIfAborted(),
    invalid: () => new Error('Message conversion returned invalid provider messages.'),
    failed: () => new Error('Message conversion failed.'),
    cancelled: () => new Error('Message conversion was cancelled.'),
  });
}

function captureProviderMessages(value: unknown): readonly ProviderMessage[] {
  if (!Array.isArray(value)) throw new Error('invalid');
  const saved = snapshotData(captureMessageHistory(value), LIMITS);
  if (!Array.isArray(saved) || !saved.every(isProviderMessage)) throw new Error('invalid');
  return saved;
}
