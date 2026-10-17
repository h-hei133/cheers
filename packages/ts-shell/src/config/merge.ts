import type { MergePolicy } from './fields.js';

/** Shared by ordinary layers and operation derivation; policies cannot diverge. */
export function mergeConfigValue(previous: unknown, value: unknown, policy: MergePolicy): unknown {
  if (previous === undefined) return value;
  switch (policy) {
    case 'intersect': {
      const allowed = new Set(value as string[]);
      return (previous as string[]).filter(item => allowed.has(item));
    }
    case 'union': return [...new Set([...(previous as string[]), ...(value as string[])])];
    case 'deny': return [...(previous as unknown[]), ...(value as unknown[])];
    case 'disable': return previous === false ? false : value;
    default: return value;
  }
}
