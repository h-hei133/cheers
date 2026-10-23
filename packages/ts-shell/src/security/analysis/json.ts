import { isRecord } from '../../core/values/record.js';
import { types } from 'node:util';
export function boundedJson(text: string): Record<string, unknown> {
  const value = parseJson(text);
  admitJsonSource(value);
  if (!isRecord(value)) throw new Error('Security report must be an object.'); return value;
}

/** Locally cloned inert data keeps its admitted source shape or omits fields. */
export function cloneJsonSource(value: unknown): Record<string, unknown> {
  admitJsonSource(value);
  const clone = parseJson(JSON.stringify(value));
  if (!isRecord(clone)) throw new Error('Security report must be an object.'); return clone;
}

function parseJson(text: string): unknown {
  if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw new Error('Security report exceeds its 4 MiB limit.');
  let value: unknown; try { value = JSON.parse(text); } catch { throw new Error('Security report contains malformed JSON.'); }
  return value;
}

/** Reject source growth before cloning or serializing the original retained object. */
export function admitJsonSource(value: unknown, maxBytes = 4 * 1024 * 1024): void {
  let nodes = 0, bytes = 0;
  const text = (value: string): void => {
    if (value.length > maxBytes - bytes) throw new Error('Security report exceeds source limits.');
    bytes += Buffer.byteLength(value);
    if (bytes > maxBytes) throw new Error('Security report exceeds source limits.');
  };
  const hook = (item: object): void => {
    for (const key of ['toString', 'valueOf', Symbol.toPrimitive]) {
      const property = Object.getOwnPropertyDescriptor(item, key);
      if (property && (!('value' in property) || typeof property.value === 'function')) throw new Error('Security report requires inert JSON source.');
    }
    let owner: object | null = item;
    while (owner) {
      if (types.isProxy(owner)) throw new Error('Security report requires inert JSON source.');
      const property = Object.getOwnPropertyDescriptor(owner, 'toJSON');
      if (property) {
        if (!('value' in property) || typeof property.value === 'function') throw new Error('Security report requires inert JSON source.');
        return;
      }
      owner = Object.getPrototypeOf(owner);
    }
  };
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 100_000 || depth > 24) throw new Error('Security report exceeds structural limits.');
    if (types.isProxy(item)) throw new Error('Security report requires inert JSON source.');
    if (typeof item === 'function') {
      if (Object.getPrototypeOf(item) !== Function.prototype) throw new Error('Security report requires inert JSON source.');
      hook(item); return;
    }
    if (typeof item === 'bigint') throw new Error('Security report requires inert JSON source.');
    if (item !== null && typeof item === 'object') {
      const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
      if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error('Security report requires inert JSON source.');
      hook(item);
      if (array) {
        if (item.length > 100_000 - nodes) throw new Error('Security report exceeds structural limits.');
        for (const key of Object.getOwnPropertyNames(item)) {
          if (key === 'length') continue;
          const index = Number(key);
          if (!Number.isInteger(index) || index < 0 || index >= item.length || String(index) !== key) throw new Error('Security report requires inert JSON source.');
        }
        for (let index = 0; index < item.length; index++) {
          const property = Object.getOwnPropertyDescriptor(item, String(index));
          if (property && !('value' in property)) throw new Error('Security report requires inert JSON source.');
          if (!property && (Object.getOwnPropertyDescriptor(Array.prototype, String(index))
            || Object.getOwnPropertyDescriptor(Object.prototype, String(index)))) throw new Error('Security report requires inert JSON source.');
          visit(property?.value ?? null, depth + 1);
        }
      } else for (const key of Object.getOwnPropertyNames(item)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Security report contains an unsupported field.');
        const property = Object.getOwnPropertyDescriptor(item, key);
        if (!property || !('value' in property)) throw new Error('Security report requires inert JSON source.');
        text(key); visit(property.value, depth + 1);
      }
    }
    else if (typeof item === 'string') text(item);
  };
  visit(value, 0);
}
