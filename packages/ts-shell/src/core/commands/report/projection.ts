import { stripVTControlCharacters } from 'node:util';
import { freezeDeep } from '../../values/freeze.js';
import { withinReportLimits } from './limits.js';
import {
  ReportLimitError,
  REPORT_BYTES,
  REPORT_DEPTH,
  REPORT_LINES,
  REPORT_NODES,
  type CommandReport,
  type ReportLine,
  type ReportRole,
  type ReportSpan,
  type ReportValue,
} from './contract.js';

interface ReportBudget {
  nodes: number;
  bytes: number;
}

function charge(budget: ReportBudget | undefined, value: string, nodes = 1): void {
  if (!budget) return;
  budget.nodes += nodes;
  budget.bytes += Buffer.byteLength(value, 'utf8') + nodes * 16;
  if (budget.nodes > REPORT_NODES || budget.bytes > REPORT_BYTES) {
    throw new ReportLimitError('Command report exceeds its resource limit.');
  }
}

/** Escape remaining controls too, including incomplete or unsupported sequences. */
function plain(value: string, budget?: ReportBudget): string {
  charge(budget, value);
  return stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Stored fallback text keeps line breaks, but no terminal controls. */
export function plainReportText(value: string): string {
  return stripVTControlCharacters(value).split('\n').map(line => plain(line)).join('\n');
}

/** Display-only text that keeps tabs and logical lines but cannot execute controls. */
export function displayReportText(value: string): string {
  return stripVTControlCharacters(value.replace(/\r\n?/g, '\n'))
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,
      char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function span(text: string | number, role: ReportRole = 'text'): ReportSpan {
  return spanWithBudget(text, role);
}

function spanWithBudget(text: string | number, role: ReportRole, budget?: ReportBudget): ReportSpan {
  return { text: plain(String(text), budget), role };
}

/** Detached immutable snapshot: later producer edits cannot stale render caches. */
export function createReport(input: Omit<CommandReport, 'version'>): CommandReport {
  const budget: ReportBudget = { nodes: 0, bytes: 0 };
  if (input.lines.length > REPORT_LINES) throw new ReportLimitError('Command report exceeds its line limit.');
  const report = {
    version: 1 as const,
    title: plain(input.title, budget),
    ...(input.columns ? { columns: input.columns.map(column => {
      return { label: plain(column.label, budget), minWidth: column.minWidth,
        ...(column.align ? { align: column.align } : {}) };
    }) } : {}),
    lines: input.lines.map(line => {
      charge(budget, '');
      return line.kind === 'space' ? { kind: 'space' as const }
        : line.kind === 'columns' ? { kind: line.kind, cells: line.cells.map(cell =>
          cell.map(item => spanWithBudget(item.text, item.role, budget))) }
          : { kind: line.kind, spans: line.spans.map(item => spanWithBudget(item.text, item.role, budget)),
            ...(line.kind === 'text' && line.bullet !== undefined ? { bullet: line.bullet } : {}) };
    }),
    facts: Object.fromEntries(Object.entries(input.facts).map(([key, value]) => [
      plain(key, budget),
      copyValue(value, budget, 0),
    ])),
  };
  const snapshot = freezeDeep(report);
  if (!withinReportLimits(snapshot) || Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > REPORT_BYTES) {
    throw new ReportLimitError('Command report exceeds its resource limit.');
  }
  return snapshot;
}

function copyValue(value: ReportValue, budget: ReportBudget, depth: number, ancestors = new Set<object>()): ReportValue {
  if (value !== null && !['string', 'number', 'boolean', 'object'].includes(typeof value)) {
    throw new TypeError('Report facts must contain JSON values.');
  }
  if (value && typeof value === 'object' && ancestors.has(value)) throw new TypeError('Report facts must not contain cycles.');
  if (depth > REPORT_DEPTH) throw new ReportLimitError('Command report exceeds its nesting limit.');
  charge(budget, '');
  if (typeof value === 'string') return plain(value, budget);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Report numbers must be finite.');
  if (value && typeof value === 'object') {
    ancestors.add(value);
    try {
      return Array.isArray(value) ? value.map(child => copyValue(child, budget, depth + 1, ancestors))
        : Object.fromEntries(Object.entries(value).map(([key, child]) =>
          [plain(key, budget), copyValue(child, budget, depth + 1, ancestors)]));
    } finally { ancestors.delete(value); }
  }
  return value;
}

export function spanText(spans: readonly ReportSpan[]): string {
  return spans.map(item => item.text).join('');
}

/** Markdown-compatible text, without terminal capabilities or control sequences. */
export function reportText(report: CommandReport, maxBytes = REPORT_BYTES): string {
  const rows: string[] = []; let bytes = 0;
  const append = (...lines: string[]): void => {
    for (const line of lines) {
      bytes += Buffer.byteLength(line, 'utf8') + 1;
      if (bytes > maxBytes) throw new ReportLimitError('Report text exceeds its limit.');
      rows.push(line);
    }
  };
  append(`### ${report.title}`, '');
  let table = false;
  for (const line of report.lines) {
    if (line.kind === 'columns') {
      if (!table && report.columns) {
        append(`| ${report.columns.map(column => column.label).join(' | ')} |`,
          `| ${report.columns.map(column => column.align === 'right' ? '---:' : ':---').join(' | ')} |`);
      }
      append(`| ${line.cells.map(spanText).join(' | ')} |`);
    } else append(lineText(line));
    table = line.kind === 'columns';
  }
  return rows.join('\n').replace(/\n+$/, '');
}

function lineText(line: Exclude<ReportLine, { kind: 'columns' }>): string {
  if (line.kind === 'space') return '';
  return `${line.kind === 'heading' ? '#### ' : line.bullet ? '- ' : ''}${spanText(line.spans)}`;
}
