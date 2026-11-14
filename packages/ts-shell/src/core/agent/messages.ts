import { isDeepStrictEqual, types } from 'node:util';
import type { AgentMessage, StandardAgentMessage } from './state.js';
import { captureMessageHistory } from './custom.js';
import { snapshotData } from '../values/data.js';
import { isProviderMessage, type ProviderMessage } from '../../model-adapters/message.js';

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
  /** Present when source indexes cannot prove the converted request's identity. */
  readonly sourceMessages?: readonly AgentMessage[];
  readonly providerMessages?: readonly ProviderMessage[];
}

const LIMITS = { bytes: 64 * 1024 * 1024, nodes: 250_000, depth: 48 } as const;
const PROMISE = Promise;
const PROMISE_PROTOTYPE = Promise.prototype;
const PROMISE_THEN = Promise.prototype.then;
const PROMISE_SPECIES = Object.getOwnPropertyDescriptor(Promise, Symbol.species)?.get;

/** Preserve the ordinary identity path; capture both sides of any application conversion. */
export async function convertMessages(messages: readonly AgentMessage[], converter?: MessageConverter, signal?: AbortSignal, reuse?: MessageProjection): Promise<MessageProjection> {
  signal?.throwIfAborted();
  let captured: readonly AgentMessage[];
  try {
    const admitted = captureMessageHistory(messages);
    if (!converter && admitted.every((message): message is StandardAgentMessage => message.role !== 'custom')) {
      return { messages: messages as readonly StandardAgentMessage[] };
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
    const projected = providerMessages.map(message => Object.freeze({ ...message, content: message.content ?? '' }));
    return Object.freeze({ messages: Object.freeze(projected), sourceMessages: captured, providerMessages });
  } catch { throw new Error('Message conversion returned invalid provider messages.'); }
}

/** Cancellation releases the request even when application work settles much later. */
function callConverter(converter: MessageConverter, messages: readonly AgentMessage[], signal?: AbortSignal): Promise<{ readonly value: readonly ProviderMessage[] }> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = (): void => { signal?.removeEventListener('abort', abort); reject(new Error('Message conversion was cancelled.')); };
    signal?.addEventListener('abort', abort, { once: true });
    const accept = (value: unknown): void => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) { abort(); return; }
      try {
        // Wrapping an inert snapshot prevents Promise assimilation of source arrays.
        resolve(Object.assign(Object.create(null), { value: captureProviderMessages(value) }));
      } catch { reject(new Error('Message conversion returned invalid provider messages.')); }
    };
    const fail = (): void => {
      signal?.removeEventListener('abort', abort);
      reject(new Error(signal?.aborted ? 'Message conversion was cancelled.' : 'Message conversion failed.'));
    };
    try {
      signal?.throwIfAborted();
      const value = converter(messages, signal);
      // Observe native promises directly; never probe a synchronous value's `then`.
      // Both handlers remain attached after cancellation to observe late rejection.
      if (canObservePromise(value)) PROMISE_THEN.call(value, accept, fail);
      else accept(value);
    } catch { fail(); }
  });
}

/** Native `then` reads constructor/species, so brand validation alone is insufficient. */
function canObservePromise(value: unknown): value is Promise<unknown> {
  if (types.isProxy(value) || !types.isPromise(value) || Object.getPrototypeOf(value) !== PROMISE_PROTOTYPE
    || Object.getOwnPropertyDescriptor(value, 'constructor') !== undefined
    || Object.getOwnPropertyDescriptor(value, 'then') !== undefined) return false;
  const constructor = Object.getOwnPropertyDescriptor(PROMISE_PROTOTYPE, 'constructor');
  const then = Object.getOwnPropertyDescriptor(PROMISE_PROTOTYPE, 'then');
  const species = Object.getOwnPropertyDescriptor(PROMISE, Symbol.species);
  return constructor?.value === PROMISE && then?.value === PROMISE_THEN
    && species?.get === PROMISE_SPECIES && species?.set === undefined;
}

function captureProviderMessages(value: unknown): readonly ProviderMessage[] {
  const saved = snapshotData(value, LIMITS);
  if (!Array.isArray(saved) || !saved.every(isProviderMessage)) throw new Error('invalid');
  return saved;
}
