import { isRecord } from '../core/values/record.js';
import type { DenyRule } from '../core/shell/approval/deny.js';

export function normalizeConfigDenials(rules: readonly DenyRule[]): DenyRule[] {
  return rules.map(rule => ({ tool: rule.tool.trim(), ...(rule.pattern ? { pattern: rule.pattern } : {}) }));
}

/** Raw config text may contain padding; runtime connection identity does not. */
export function normalizeConnectionId(value?: string): string | undefined {
  return value?.trim() || undefined;
}

/** JSON treats both zero spellings as the same value; keep the original token. */
export function sameValue(before: unknown, after: unknown): boolean {
  if (before === after) return true;
  if (Array.isArray(before) && Array.isArray(after)) return before.length === after.length && before.every((value, index) => sameValue(value, after[index]));
  if (isRecord(before) && isRecord(after)) return Object.keys(before).length === Object.keys(after).length && Object.keys(before).every(key => Object.hasOwn(after, key) && sameValue(before[key], after[key]));
  return false;
}

export function sameArraySlots(before: unknown[], after: unknown[]): boolean {
  const ids = new Set<string>();
  return before.length === after.length && before.every((value, index) => {
    const next = after[index];
    if (!isRecord(value) || !isRecord(next) || typeof value.id !== 'string' || value.id !== next.id || ids.has(value.id)) return false;
    ids.add(value.id);
    return true;
  });
}
