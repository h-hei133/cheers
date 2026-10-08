import type { ModelUsage } from './model.js';

/** Repeated cumulative snapshots refine known facts; they never add deltas or erase them. */
export function refineRequestUsage(previous: ModelUsage | undefined, next: ModelUsage | undefined): ModelUsage | undefined {
  if (!previous) return next;
  if (!next) return previous;
  const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reportedTotalTokens'] as const;
  let inconsistent = previous.inconsistent || next.inconsistent || false;
  for (const field of fields) {
    if (previous[field] !== undefined && next[field] !== undefined && (next[field]! < previous[field]!
      || (previous.complete && previous[field] !== next[field]))) inconsistent = true;
  }
  const refined: Record<string, number | boolean> = { version: 1, complete: next.complete && !inconsistent };
  for (const field of fields) {
    const value = Math.max(previous[field] ?? -1, next[field] ?? -1);
    if (value >= 0) refined[field] = value;
  }
  if (inconsistent) refined.inconsistent = true;
  return refined as unknown as ModelUsage;
}
