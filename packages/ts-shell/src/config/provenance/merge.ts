import type { MergePolicy } from '../fields.js';
import { type ConfigOrigin, replaceOrigin, sourcesOf } from './model.js';
import { contributeFiles, replaceFiles } from './files.js';

function contributions(previous: ConfigOrigin, next: ConfigOrigin, children?: Record<string, ConfigOrigin>): ConfigOrigin {
  return { sources: sourcesOf([previous, next]), shadowed: [...new Set([...previous.shadowed, ...next.shadowed])],
    rejected: [...previous.rejected, ...next.rejected], ...contributeFiles(previous, next), ...(children ? { children } : {}) };
}

function collectionOrigins(before: unknown[], value: unknown[], result: unknown[], previous: ConfigOrigin, next: ConfigOrigin, policy: MergePolicy): Record<string, ConfigOrigin> {
  if (policy === 'deny') return Object.fromEntries([
    ...before.map((_, index) => previous.children?.[String(index)] ?? previous),
    ...value.map((_, index) => next.children?.[String(index)] ?? next),
  ].map((node, index) => [String(index), node]));
  const indexed = new Map<string, ConfigOrigin>();
  for (const [items, trace] of [[before, previous], [value, next]] as const) {
    items.forEach((item, index) => {
      const key = JSON.stringify(item); const node = trace.children?.[String(index)] ?? trace;
      const existing = indexed.get(key);
      indexed.set(key, existing ? contributions(existing, node) : node);
    });
  }
  return Object.fromEntries(result.map((item, index) => [String(index), indexed.get(JSON.stringify(item))!]));
}

/** Mirrors the owning layer merge; it never decides the effective value. */
export function mergeOrigin(before: unknown, value: unknown, result: unknown, previous: ConfigOrigin | undefined, next: ConfigOrigin, policy: MergePolicy): ConfigOrigin {
  if (before === undefined || !previous) return replaceOrigin(previous, next);
  if (policy === 'replace') return replaceOrigin(previous, next);
  if (policy === 'disable') return before === false && value !== false
    ? { ...previous, shadowed: [...new Set([...previous.shadowed, ...next.sources])], rejected: [...previous.rejected, ...next.rejected], ...replaceFiles(next, previous) }
    : value === false && before !== false ? replaceOrigin(previous, next) : contributions(previous, next);
  return contributions(previous, next, collectionOrigins(before as unknown[], value as unknown[], result as unknown[], previous, next, policy));
}
