import { types } from 'node:util';
import { snapshotData } from '../../values/data.js';
import { isRecord } from '../../values/record.js';
import type { RequestDeclaration } from './model.js';

const LIMITS = { bytes: 4 * 1024 * 1024, nodes: 100_000, depth: 40 } as const;
const MAX_TOOLS = 4096;

/** JSON object properties cannot disappear during capture and change a tool schema. */
function assertDefined(value: unknown): void {
  let nodes = 0;
  const seen = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth) throw new Error('Request declaration exceeds its structural limit.');
    if (item === undefined) throw new Error('Request declaration requires JSON values.');
    if (item === null || typeof item !== 'object') return;
    if (types.isProxy(item)) throw new Error('Request declaration requires inert JSON values.');
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== null && prototype !== Object.prototype) {
      throw new Error('Request declaration requires plain JSON values.');
    }
    if (seen.has(item)) return;
    seen.add(item);
    const names = Reflect.ownKeys(item);
    if (names.length > LIMITS.nodes - nodes) throw new Error('Request declaration exceeds its structural limit.');
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(item, name);
      if (!descriptor || !('value' in descriptor)) throw new Error('Request declaration cannot contain accessors.');
      visit(descriptor.value, depth + 1);
    }
  };
  visit(value, 0);
}

function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function text(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= limit;
}

/** Validate only detached data; no source property is read before its descriptor. */
function validate(value: unknown): RequestDeclaration {
  if (!isRecord(value) || !keys(value, ['version', 'target', 'tools'], ['effort']) || value.version !== 1
    || !isRecord(value.target) || !keys(value.target, ['provider', 'model', 'endpoint', 'replayBinding'])
    || !text(value.target.provider, 256) || !text(value.target.model, 512) || !text(value.target.endpoint, 128)
    || typeof value.target.replayBinding !== 'string' || !/^[a-f0-9]{64}$/.test(value.target.replayBinding)
    || !Array.isArray(value.tools) || value.tools.length > MAX_TOOLS
    || (value.effort !== undefined && !text(value.effort, 64))) throw new Error('Request declaration has an invalid shape.');
  const names = new Set<string>();
  for (const tool of value.tools) {
    if (!isRecord(tool) || !keys(tool, ['type', 'function']) || tool.type !== 'function'
      || !isRecord(tool.function) || !keys(tool.function, ['name', 'parameters'], ['description'])
      || !text(tool.function.name, 256) || names.has(tool.function.name)
      || (tool.function.description !== undefined && typeof tool.function.description !== 'string')
      || !isRecord(tool.function.parameters)) throw new Error('Request declaration contains an invalid tool.');
    names.add(tool.function.name);
  }
  return value as unknown as RequestDeclaration;
}

/** Capture bounded declaration data without invoking accessors or serialization hooks. */
export function snapshotRequestDeclaration(value: unknown): RequestDeclaration {
  assertDefined(value);
  return validate(snapshotData(value, LIMITS));
}

/** A declaration is a system history record with empty text, never ordinary content. */
export function captureRequestDeclaration<T extends { readonly role: string }>(message: T): T {
  if (!message || typeof message !== 'object' || types.isProxy(message)) throw new Error('Request declaration requires inert message data.');
  const role = Object.getOwnPropertyDescriptor(message, 'role');
  if (!role || !('value' in role)) throw new Error('Request declaration requires an own message role.');
  const declaration = Object.getOwnPropertyDescriptor(message, 'requestDeclaration');
  if (!declaration) {
    const prototype = Object.getPrototypeOf(message);
    if (prototype !== null && prototype !== Object.prototype) throw new Error('Request declaration requires a plain message.');
    return message;
  }
  if (!('value' in declaration)) throw new Error('Request declaration cannot contain accessors.');
  if (declaration.value === undefined) throw new Error('Request declaration requires JSON values.');
  snapshotRequestDeclaration(declaration.value);
  const captured = snapshotData(message, LIMITS);
  if (!isRecord(captured) || captured.role !== 'system' || captured.content !== ''
    || (captured.id !== undefined && !text(captured.id, 256))
    || (captured.timestamp !== undefined && !text(captured.timestamp, 256))
    || ['tool_calls', 'tool_call_id', 'reasoning', 'promptMeasurement', 'admissionFailure', 'stopReason', 'errorMessage']
      .some(key => captured[key] !== undefined)) {
    throw new Error('Request declaration requires a system message with empty text.');
  }
  validate(captured.requestDeclaration);
  return captured as unknown as T;
}
