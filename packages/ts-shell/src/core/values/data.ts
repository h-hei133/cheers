import { types } from 'node:util';

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** Capture bounded JSON data without invoking source accessors or serialization hooks. */
export function snapshotData(value: unknown, limits: { readonly bytes: number; readonly nodes: number; readonly depth: number }): JsonValue {
  let bytes = 0, nodes = 0;
  const ancestors = new Set<object>();
  const count = (text: string): void => {
    if (text.length > limits.bytes - bytes) throw new Error('Message data exceeds its size limit.');
    bytes += Buffer.byteLength(JSON.stringify(text));
    if (bytes > limits.bytes) throw new Error('Message data exceeds its size limit.');
  };
  const visit = (item: unknown, depth: number): JsonValue => {
    if (++nodes > limits.nodes || depth > limits.depth || ++bytes > limits.bytes) throw new Error('Message data exceeds its structural limit.');
    if (item === null || typeof item === 'boolean') {
      bytes += String(item).length;
      if (bytes > limits.bytes) throw new Error('Message data exceeds its size limit.');
      return item;
    }
    if (typeof item === 'string') { count(item); return item; }
    if (typeof item === 'number' && Number.isFinite(item)) {
      bytes += JSON.stringify(item).length;
      if (bytes > limits.bytes) throw new Error('Message data exceeds its size limit.');
      return item;
    }
    if (typeof item !== 'object' || types.isProxy(item)) throw new Error('Message data must contain inert JSON values.');
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if ((array ? prototype !== Array.prototype : prototype !== null && prototype !== Object.prototype) || ancestors.has(item)) {
      throw new Error('Message data must contain acyclic JSON values.');
    }
    ancestors.add(item);
    const keys = Reflect.ownKeys(item);
    if (keys.length > limits.nodes - nodes || keys.some(key => typeof key !== 'string')) throw new Error('Message data exceeds its structural limit.');
    const target: Record<string, JsonValue> = Object.create(null);
    const entries: JsonValue[] = [];
    if (array && item.length > limits.nodes - nodes) throw new Error('Message data exceeds its structural limit.');
    for (const key of keys as string[]) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !('value' in descriptor)) throw new Error('Message data cannot contain accessors.');
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length)) throw new Error('Message arrays cannot contain named fields.');
      if (descriptor.value === undefined && !array) continue;
      count(key);
      const child = visit(descriptor.value, depth + 1);
      if (array) entries[Number(key)] = child;
      else target[key] = child;
    }
    if (array && (entries.length !== item.length || keys.length !== item.length + 1)) throw new Error('Message arrays cannot contain missing entries.');
    ancestors.delete(item);
    return Object.freeze(array ? entries : target);
  };
  const snapshot = visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(snapshot)) > limits.bytes) throw new Error('Message data exceeds its size limit.');
  return snapshot;
}
