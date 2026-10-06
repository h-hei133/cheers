import { isRecord } from '../../values/record.js';
import { REPORT_ROLES, type CommandReport } from './contract.js';
import { createReport, reportText } from './projection.js';

export const REPORT_BYTES = 1024 * 1024;
const roles: ReadonlySet<unknown> = new Set(REPORT_ROLES);

/** Persisted semantics are optional: unfamiliar or damaged data keeps its text fallback. */
export function readReport(value: unknown): CommandReport | undefined {
  if (!boundedJson(value) || !isRecord(value) || value.version !== 1 || typeof value.title !== 'string' ||
    !Array.isArray(value.lines) || !value.lines.every(line) || !isRecord(value.facts) ||
    (value.columns !== undefined && (!Array.isArray(value.columns) || !value.columns.every(column)))) return undefined;
  const report = createReport(value as unknown as CommandReport);
  try { reportText(report, REPORT_BYTES); } catch { return undefined; }
  return Buffer.byteLength(JSON.stringify(report), 'utf8') <= REPORT_BYTES ? report : undefined;
}

function spans(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => isRecord(item) && typeof item.text === 'string' && roles.has(item.role));
}

function line(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === 'space') return true;
  if (value.kind === 'columns') return Array.isArray(value.cells) && value.cells.every(spans);
  if (value.kind === 'heading') return spans(value.spans);
  return value.kind === 'text' && spans(value.spans) && (value.bullet === undefined || typeof value.bullet === 'boolean');
}

function column(value: unknown): boolean {
  return isRecord(value) && typeof value.label === 'string' && Number.isInteger(value.minWidth) &&
    Number(value.minWidth) > 0 && Number(value.minWidth) <= 10000 &&
    (value.align === undefined || value.align === 'left' || value.align === 'right');
}

/** Bound traversal before recursion, cloning or serialization; reject cycles and non-JSON values. */
function boundedJson(value: unknown): boolean {
  const pending = [{ value, depth: 0 }]; const seen = new Set<object>();
  let nodes = 0; let bytes = 0;
  while (pending.length) {
    const next = pending.pop()!;
    if (++nodes > 20000 || next.depth > 32) return false;
    const item = next.value;
    if (typeof item === 'string') bytes += Buffer.byteLength(item, 'utf8');
    else if (typeof item === 'number') { if (!Number.isFinite(item)) return false; }
    else if (item !== null && typeof item === 'object') {
      if (seen.has(item)) return false;
      seen.add(item);
      const children = Array.isArray(item) ? item : Object.values(item);
      if (nodes + pending.length + children.length > 20000) return false;
      if (!Array.isArray(item)) for (const key of Object.keys(item)) bytes += Buffer.byteLength(key, 'utf8');
      for (const child of children) pending.push({ value: child, depth: next.depth + 1 });
    } else if (item !== null && typeof item !== 'boolean') return false;
    if (bytes > REPORT_BYTES) return false;
  }
  return true;
}
