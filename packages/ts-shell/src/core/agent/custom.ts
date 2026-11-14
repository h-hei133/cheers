import { isRecord } from '../values/record.js';
import { snapshotData, type JsonValue } from '../values/data.js';
import { isMessageContent, type MessageContent } from '../../model-adapters/message.js';
import { types } from 'node:util';

/** Application-owned history. Display policy is independent of model projection. */
export interface CustomAgentMessage {
  id?: string;
  role: 'custom';
  customType: string;
  content: MessageContent;
  display: boolean;
  data?: JsonValue;
  timestamp?: string;
  metadata?: Record<string, unknown>;
  tool_calls?: never;
  tool_call_id?: never;
  origin?: never;
  reasoning?: never;
  failureClass?: never;
  promptMeasurement?: never;
  admissionFailure?: never;
  stopReason?: never;
  errorMessage?: never;
}

export type CustomMessageInput = Pick<CustomAgentMessage, 'customType' | 'content' | 'display' | 'data'>;

/** Inspect the discriminant without executing application code. */
export function captureCustomMessage<T extends { readonly role: string }>(value: T): T {
  if (!value || typeof value !== 'object' || types.isProxy(value)) throw new Error('Message must be inert data.');
  const role = Object.getOwnPropertyDescriptor(value, 'role');
  if (!role || !('value' in role)) throw new Error('Message role must be an own data property.');
  return role.value === 'custom' ? snapshotCustomMessage(value) as unknown as T : value;
}

/** Validate and detach at ingress, before persistence or an application callback. */
export function snapshotCustomMessage(value: unknown): CustomAgentMessage {
  const saved = snapshotData(value, { bytes: 32 * 1024 * 1024, nodes: 100_000, depth: 32 });
  if (!isRecord(saved) || saved.role !== 'custom' || typeof saved.customType !== 'string' || !/^[\w.-]{1,128}$/.test(saved.customType)
    || typeof saved.display !== 'boolean' || !isMessageContent(saved.content)
    || (saved.id !== undefined && (typeof saved.id !== 'string' || !saved.id))
    || (saved.timestamp !== undefined && typeof saved.timestamp !== 'string')
    || (saved.metadata !== undefined && !isRecord(saved.metadata))
    || ['tool_calls', 'tool_call_id', 'origin', 'reasoning', 'failureClass', 'promptMeasurement', 'admissionFailure', 'stopReason', 'errorMessage']
      .some(key => saved[key] !== undefined)) throw new Error('Custom message has an invalid shape.');
  if (saved.data !== undefined) snapshotData(saved.data, { bytes: 256 * 1024, nodes: 10_000, depth: 24 });
  return saved as unknown as CustomAgentMessage;
}

/** Read array entries only after rejecting proxy traps, accessors and sparse input. */
export function captureMessageHistory<T extends { readonly role: string }>(value: readonly T[]): T[] {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error('Message history must be an inert array.');
  }
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > 250_000) throw new Error('Message history exceeds its structural limit.');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) throw new Error('Message history must contain only complete array entries.');
  const messages: T[] = [];
  for (let index = 0; index < length; index++) {
    const entry = Object.getOwnPropertyDescriptor(value, String(index));
    if (!entry || !('value' in entry)) throw new Error('Message history cannot contain accessors or missing entries.');
    messages.push(captureCustomMessage(entry.value));
  }
  return messages;
}

export function isCustomMessage(value: unknown): value is CustomAgentMessage {
  try { snapshotCustomMessage(value); return true; } catch { return false; }
}
