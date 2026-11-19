import { snapshotData } from '../../core/values/data.js';
import type { ExtensionMessageEndEvent, ExtensionMessageEndResult } from './model.js';

export function createMessageResultCapture(snapshot: typeof snapshotData) {
  return function capture(result: unknown): ExtensionMessageEndResult | undefined {
    if (result === undefined) return undefined;
    const value = snapshot(result, { bytes: 192 * 1024, depth: 12, nodes: 4096, allowCrossRealm: true });
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid extension message result.');
    const message = (value as Record<string, unknown>).message;
    if (message === undefined) return undefined;
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid extension message.');
    const { role, content } = message as Record<string, unknown>;
    if (role !== 'assistant' || typeof content !== 'string' || !content.trim() || Buffer.byteLength(content) > 128 * 1024) {
      throw new Error('Invalid extension assistant text.');
    }
    return Object.freeze({ message: Object.freeze({ role, content }) });
  };
}

export const captureMessageResult = createMessageResultCapture(snapshotData);

export function projectMessageEnd(event: ExtensionMessageEndEvent, result?: ExtensionMessageEndResult): ExtensionMessageEndEvent {
  if (!event.canReplace || !result?.message) return event;
  return Object.freeze({ ...event, message: Object.freeze({ ...event.message, content: result.message.content }) });
}
