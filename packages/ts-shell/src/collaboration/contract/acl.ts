import type { Right } from './model.js';
import { identifier, object, requireValue } from './value.js';
export function decodeAcl(value: unknown): Record<string, Right[]> {
  const input = object(value); requireValue(Object.keys(input).length <= 32);
  const result: Record<string, Right[]> = Object.create(null) as Record<string, Right[]>;
  for (const [name, items] of Object.entries(input)) {
    const principal = identifier(name); requireValue(!['__proto__', 'constructor', 'prototype'].includes(principal)
      && Array.isArray(items) && items.length <= 3 && items.every(item => ['observe', 'ask', 'control'].includes(item)));
    const selected = [...new Set(items)] as Right[]; requireValue(!selected.length || selected.includes('observe')); result[principal] = selected;
  }
  return result;
}
