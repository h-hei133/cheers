import type { MergePolicy } from '../fields.js';
import { type ConfigOrigin, origin, replaceOrigin, sourcesOf } from './model.js';

function contributions(previous: ConfigOrigin, next: ConfigOrigin, children?: Record<string, ConfigOrigin>): ConfigOrigin {
  return { sources: sourcesOf([previous, next]), shadowed: [...new Set([...previous.shadowed, ...next.shadowed])],
    rejected: [...previous.rejected, ...next.rejected], ...(children ? { children } : {}) };
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
    ? { ...previous, shadowed: [...new Set([...previous.shadowed, ...next.sources])], rejected: [...previous.rejected, ...next.rejected] }
    : value === false && before !== false ? replaceOrigin(previous, next) : contributions(previous, next);
  if (policy === 'tui') {
    const project = before as Record<string, unknown>;
    const children = Object.fromEntries(Object.keys(result as object).map(key => {
      const prior = previous.children?.[key]; const incoming = next.children?.[key];
      const fallsThrough = key === 'statusItems' && Array.isArray(project[key]) && (project[key] as unknown[]).length === 0;
      return [key, prior && !fallsThrough ? replaceOrigin(incoming, prior) : replaceOrigin(prior, incoming ?? origin('default'))];
    }));
    return { ...contributions(previous, next, children), sources: sourcesOf(Object.values(children)) };
  }
  return contributions(previous, next, collectionOrigins(before as unknown[], value as unknown[], result as unknown[], previous, next, policy));
}
