import { types } from 'node:util';
import { snapshotData } from '../values/data.js';
import { invalidSchema, type Schema } from './contract.js';

const schemaLimits = { bytes: 1_048_576, nodes: 25_000, depth: 64 };
const inputLimits = { bytes: 67_108_864, nodes: 250_000, depth: 128 };

export interface CapturedSchema {
  readonly schema: Schema;
  /** Original inert JSON, before dialect, reference, or nullable normalization. */
  readonly source: string;
}

export function isSchema(value: unknown): value is Schema {
  return typeof value === 'boolean'
    || value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Capture without executing getters, proxies, or serialization hooks. */
export function captureSchema(value: unknown): CapturedSchema {
  try {
    rejectSchemaUndefined(value);
    const inert = snapshotData(value, schemaLimits);
    if (!isSchema(inert)) invalidSchema();
    const source = JSON.stringify(inert);
    return { schema: JSON.parse(source) as Schema, source };
  } catch {
    return invalidSchema();
  }
}

function rejectSchemaUndefined(value: unknown): void {
  let nodes = 0;
  const seen = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (item === undefined || ++nodes > schemaLimits.nodes || depth > schemaLimits.depth) invalidSchema();
    if (!item || typeof item !== 'object') return;
    if (types.isProxy(item) || seen.has(item)) invalidSchema();
    seen.add(item);
    const keys = Object.getOwnPropertyNames(item);
    if (keys.length > schemaLimits.nodes - nodes) invalidSchema();
    for (const key of keys) {
      if (Array.isArray(item) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !('value' in descriptor)) invalidSchema();
      visit(descriptor.value, depth + 1);
    }
    seen.delete(item);
  };
  visit(value, 0);
}

/**
 * Preserve own-property validation, including optional undefined and ignored
 * symbol metadata. The compiler receives an inert copy, never caller objects.
 */
export function captureInput(value: unknown): unknown {
  const ancestors = new Set<object>();
  let nodes = 0;
  let bytes = 0;
  const count = (text: string): void => {
    bytes += Buffer.byteLength(text);
    if (bytes > inputLimits.bytes) throw new Error('Validation data exceeds its limit.');
  };
  const visit = (item: unknown, depth: number): unknown => {
    if (++nodes > inputLimits.nodes || depth > inputLimits.depth) {
      throw new Error('Validation data exceeds its limit.');
    }
    if (item === undefined || item === null || typeof item === 'boolean' || typeof item === 'number') return item;
    if (typeof item === 'string') { count(item); return item; }
    if (typeof item !== 'object' || types.isProxy(item) || ancestors.has(item)) {
      throw new Error('Validation data must be inert.');
    }
    ancestors.add(item);
    const array = Array.isArray(item);
    const result: unknown[] | Record<string, unknown> = array ? [] : Object.create(null);
    const keys = Object.getOwnPropertyNames(item);
    const childCount = keys.length - (array ? 1 : 0);
    if (childCount > inputLimits.nodes - nodes) throw new Error('Validation data exceeds its limit.');
    if (array) {
      const length = Object.getOwnPropertyDescriptor(item, 'length');
      if (!length || !('value' in length) || length.value > inputLimits.nodes - nodes) {
        throw new Error('Validation data exceeds its limit.');
      }
      (result as unknown[]).length = length.value as number;
    }
    for (const key of keys) {
      if (array && (key === 'length' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= (result as unknown[]).length)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !('value' in descriptor)) throw new Error('Validation data cannot contain accessors.');
      count(key);
      Object.defineProperty(result, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: descriptor.enumerable,
        configurable: false,
        writable: false,
      });
    }
    ancestors.delete(item);
    return Object.freeze(result);
  };
  return visit(value, 0);
}
