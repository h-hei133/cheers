import { isRecord } from '../../values/record.js';
import { REPORT_BYTES, REPORT_ROLES, type CommandReport } from './contract.js';
import { createReport, reportText } from './projection.js';
import { withinReportLimits } from './limits.js';

export { REPORT_BYTES } from './contract.js';
const roles: ReadonlySet<unknown> = new Set(REPORT_ROLES);

/** Persisted semantics are optional: unfamiliar or damaged data keeps its text fallback. */
export function readReport(value: unknown): CommandReport | undefined {
  if (!withinReportLimits(value) || !isRecord(value) || value.version !== 1 || typeof value.title !== 'string' ||
    !Array.isArray(value.lines) || !value.lines.every(line) || !isRecord(value.facts) ||
    (value.columns !== undefined && (!Array.isArray(value.columns) || !value.columns.every(column)))) return undefined;
  try {
    const report = createReport(value as unknown as CommandReport);
    reportText(report, REPORT_BYTES);
    return Buffer.byteLength(JSON.stringify(report), 'utf8') <= REPORT_BYTES ? report : undefined;
  } catch {
    return undefined;
  }
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
