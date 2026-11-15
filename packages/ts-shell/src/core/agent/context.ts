import { isDeepStrictEqual, types } from 'node:util';
import type { AgentMessage, StandardAgentMessage } from './state.js';
import type { MessageProjection } from './messages.js';
import { captureMessageHistory } from './custom.js';
import { snapshotData } from '../values/data.js';
import { assertDeclarationHistory } from './declarations/history.js';

/** The live loop may accept only a projection proved from its captured raw history. */
export interface RequestContextOwner {
  readonly eligible: boolean;
  isCurrent(): boolean;
  accept(projection: MessageProjection): boolean;
  /** Persist one proved declaration before publishing its append to live history. */
  appendDeclaration?(message: StandardAgentMessage, projection: MessageProjection, persist: (message: StandardAgentMessage) => void): boolean;
}

/** Admit only one inert marker appended to this exact committed history. */
export function captureDeclarationAppend(messages: readonly AgentMessage[], message: StandardAgentMessage,
  projection: MessageProjection): { readonly message: StandardAgentMessage; readonly sourceMessages: readonly AgentMessage[];
    readonly projection: MessageProjection } | undefined {
  try {
    if (!projection || typeof projection !== 'object' || types.isProxy(projection)) return undefined;
    const prototype = Object.getPrototypeOf(projection);
    if (prototype !== null && prototype !== Object.prototype) return undefined;
    const fields = Object.getOwnPropertyDescriptors(projection);
    if (Reflect.ownKeys(fields).some(key => typeof key !== 'string' || !['messages', 'sourceMessages', 'providerMessages'].includes(key)
      || !('value' in fields[key]!))) return undefined;
    if (!fields.messages || !fields.sourceMessages) return undefined;
    const saved = captureContext([message])[0]!;
    if (saved.role !== 'system' || saved.content !== '' || !saved.requestDeclaration || !saved.id) return undefined;
    if (!Array.isArray(fields.sourceMessages.value)) return undefined;
    const next = captureContext(fields.sourceMessages.value);
    if (!Array.isArray(fields.messages.value) || fields.providerMessages?.value !== undefined && !Array.isArray(fields.providerMessages.value)) return undefined;
    const converted = captureContext(fields.messages.value);
    const provider = fields.providerMessages?.value === undefined ? undefined : captureContext(fields.providerMessages.value);
    if (converted.some(entry => entry.role === 'custom') || provider?.some(entry => entry.role === 'custom')) return undefined;
    const captured = snapshotData({ sourceMessages: next, messages: converted,
      ...(provider ? { providerMessages: provider } : {}) }, { bytes: 64 * 1024 * 1024, nodes: 250_000, depth: 48 }) as unknown as MessageProjection;
    if (next.length !== messages.length + 1 || !sameContext(next.slice(0, -1), messages)
      || !sameContext(next.slice(-1), [saved]) || messages.some(entry => entry.id === saved.id)) return undefined;
    assertDeclarationHistory(next, captured.messages);
    if (captured.providerMessages) assertDeclarationHistory(next, captured.providerMessages);
    return { message: saved, sourceMessages: next, projection: Object.freeze({ ...captured, sourceMessages: next }) };
  } catch { return undefined; }
}

/** Request declarations describe a request; they do not change its dialogue role. */
export function lastContextMessageIndex(messages: readonly AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!messages[index]!.requestDeclaration) return index;
  }
  return -1;
}

export function captureContext(messages: readonly AgentMessage[]): readonly AgentMessage[] {
  return snapshotData(captureMessageHistory(messages), { bytes: 64 * 1024 * 1024, nodes: 250_000, depth: 48 }) as unknown as readonly AgentMessage[];
}

/** Never run application getters while checking a request against live state. */
export function sameContext(messages: readonly AgentMessage[], captured: readonly AgentMessage[]): boolean {
  try { return isDeepStrictEqual(captureContext(messages), captured); }
  catch { return false; }
}

/** Awaited preparation must still belong to the history captured before it started. */
export function assertContextCurrent(messages: readonly AgentMessage[], captured: readonly AgentMessage[],
  isCurrent: ((messages: readonly AgentMessage[]) => boolean) | undefined, signal?: AbortSignal): void {
  signal?.throwIfAborted();
  if (!sameContext(messages, captured) || !(isCurrent?.(captured) ?? true)) {
    throw new Error('Agent history changed during preparation.');
  }
  signal?.throwIfAborted();
}
