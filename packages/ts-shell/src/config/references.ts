import type { AnySchemaObject } from 'ajv';
import { CONFIG_MAX_BYTES } from './syntax.js';

export class ConfigReferenceError extends Error {
  constructor(readonly code: 'missing-environment' | 'resource-limit') { super(code); }
}

/** Replacement output is never scanned again. $$ escapes a literal dollar. */
function expand(value: string, budget: { bytes: number }): string {
  let bytes = 0;
  const result = value.replace(/\$\$|\$\{([A-Za-z0-9_]+)\}|\$([A-Za-z0-9_]+)/g, (match, braced: string | undefined, bare: string | undefined) => {
    if (match === '$$') return '$';
    const replacement = process.env[braced ?? bare!];
    if (replacement === undefined) throw new ConfigReferenceError('missing-environment');
    bytes += Buffer.byteLength(replacement);
    if (bytes > CONFIG_MAX_BYTES) throw new ConfigReferenceError('resource-limit');
    return replacement;
  });
  budget.bytes += Buffer.byteLength(result);
  if (budget.bytes > CONFIG_MAX_BYTES) throw new ConfigReferenceError('resource-limit');
  return result;
}

/** Called only for user fields after source filtering and shape validation. */
export function resolveConfigReferences(value: unknown, schema: AnySchemaObject, budget: { bytes: number }): unknown {
  if (typeof value === 'string') return schema.environment === true ? expand(value, budget) : value;
  if (Array.isArray(value) && schema.items) return value.map(item => resolveConfigReferences(item, schema.items, budget));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      const childSchema = schema.properties?.[key];
      return [key, childSchema ? resolveConfigReferences(child, childSchema, budget) : child];
    }));
  }
  return value;
}
