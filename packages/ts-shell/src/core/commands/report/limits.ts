import { REPORT_BYTES, REPORT_DEPTH, REPORT_NODES } from './contract.js';

/** Bound traversal before recursion, cloning or serialization; reject cycles and non-JSON values. */
export function withinReportLimits(value: unknown): boolean {
  const pending = [{ value, depth: 0 }]; const seen = new Set<object>();
  let nodes = 0; let bytes = 0;
  while (pending.length) {
    const next = pending.pop()!;
    if (++nodes > REPORT_NODES || next.depth > REPORT_DEPTH) return false;
    const item = next.value;
    if (typeof item === 'string') bytes += Buffer.byteLength(item, 'utf8');
    else if (typeof item === 'number') { if (!Number.isFinite(item)) return false; }
    else if (item !== null && typeof item === 'object') {
      if (seen.has(item)) return false;
      seen.add(item);
      const children = Array.isArray(item) ? item : Object.values(item);
      if (nodes + pending.length + children.length > REPORT_NODES) return false;
      if (!Array.isArray(item)) for (const key of Object.keys(item)) bytes += Buffer.byteLength(key, 'utf8');
      for (const child of children) pending.push({ value: child, depth: next.depth + 1 });
    } else if (item !== null && typeof item !== 'boolean') return false;
    if (bytes > REPORT_BYTES) return false;
  }
  return true;
}
