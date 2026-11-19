import { types } from 'node:util';
import { snapshotData } from '../../core/values/data.js';

const DATA_LIMITS = { bytes: 16 * 1024 * 1024, nodes: 100_000, depth: 32, allowCrossRealm: true } as const;

/** Native data slots exclude source accessors, proxies, serialization hooks and iterators. */
export function resourceFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) {
    throw new Error('Resource snapshot requires an inert record.');
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length > 4096 || keys.some(key => typeof key !== 'string')) throw new Error('Resource snapshot has unsupported fields.');
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) throw new Error('Resource snapshot cannot contain accessors.');
    result[key] = descriptor.value;
  }
  return result;
}

export function resourceArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || types.isProxy(value)) throw new Error('Resource snapshot requires an inert array.');
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as number;
  if (length > 4096 || Reflect.ownKeys(value).length !== length + 1) throw new Error('Resource snapshot array is invalid.');
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor || !('value' in descriptor)) throw new Error('Resource snapshot array requires data slots.');
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}

/** Preserve explicit callable capabilities while the shared decoder owns inert metadata. */
export function resourceRecord<T>(value: unknown, callbacks: readonly string[] = [], nested: readonly string[] = []): T {
  const fields = resourceFields(value), metadata: Record<string, unknown> = Object.create(null);
  const capabilities: Record<string, unknown> = Object.create(null);
  for (const [key, field] of Object.entries(fields)) {
    if (callbacks.includes(key)) {
      if (field !== undefined && typeof field !== 'function') throw new Error('Resource snapshot callback is invalid.');
      if (field !== undefined) capabilities[key] = field;
    } else if (nested.includes(key)) capabilities[key] = field;
    else metadata[key] = field;
  }
  const captured = snapshotData(metadata, DATA_LIMITS);
  return Object.freeze(Object.assign(Object.create(null), captured, capabilities)) as T;
}

export function resourceText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Resource snapshot requires text.');
  return value;
}
