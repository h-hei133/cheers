import { stripVTControlCharacters } from 'node:util';
import { freezeDeep } from '../../values/freeze.js';
import type { CommandReport, ReportLine, ReportRole, ReportSpan, ReportValue } from './contract.js';

/** Escape remaining controls too, including incomplete or unsupported sequences. */
function plain(value: string): string {
  return stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Stored fallback text keeps line breaks, but no terminal controls. */
export function plainReportText(value: string): string {
  return stripVTControlCharacters(value).split('\n').map(plain).join('\n');
}

export function span(text: string | number, role: ReportRole = 'text'): ReportSpan {
  return { text: plain(String(text)), role };
}

/** Detached immutable snapshot: later producer edits cannot stale render caches. */
export function createReport(input: Omit<CommandReport, 'version'>): CommandReport {
  return freezeDeep({ version: 1 as const, title: plain(input.title),
    ...(input.columns ? { columns: input.columns.map(column => ({ label: plain(column.label), minWidth: column.minWidth,
      ...(column.align ? { align: column.align } : {}) })) } : {}),
    lines: input.lines.map(line => line.kind === 'space' ? { kind: 'space' as const }
      : line.kind === 'columns' ? { kind: line.kind, cells: line.cells.map(cell => cell.map(item => span(item.text, item.role))) }
      : { kind: line.kind, spans: line.spans.map(item => span(item.text, item.role)),
        ...(line.kind === 'text' && line.bullet !== undefined ? { bullet: line.bullet } : {}) }),
    facts: Object.fromEntries(Object.entries(input.facts).map(([key, value]) => [plain(key), copyValue(value)])),
  });
}

function copyValue(value: ReportValue): ReportValue {
  if (typeof value === 'string') return plain(value);
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Report numbers must be finite.');
  if (Array.isArray(value)) return value.map(copyValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [plain(key), copyValue(child)]));
  return value;
}

export function spanText(spans: readonly ReportSpan[]): string {
  return spans.map(item => item.text).join('');
}

/** Markdown-compatible text, without terminal capabilities or control sequences. */
export function reportText(report: CommandReport, maxBytes = Infinity): string {
  const rows: string[] = []; let bytes = 0;
  const append = (...lines: string[]): void => {
    for (const line of lines) {
      bytes += Buffer.byteLength(line, 'utf8') + 1;
      if (bytes > maxBytes) throw new RangeError('Report text exceeds its limit.');
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
