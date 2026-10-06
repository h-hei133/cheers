import type { CommandReport, ReportRole, ReportSpan } from '../../../core/commands/report/contract.js';
import { spanText } from '../../../core/commands/report/projection.js';
import { defaultTheme } from '../../theme/theme.js';
import type { ThemeColorToken } from '../../theme/tokens.js';
import { padToWidth, wrapToWidth } from '../text/layout.js';
import { visibleWidth } from '../text/measure.js';

const TOKENS: Record<ReportRole, ThemeColorToken> = {
  text: 'text', command: 'command', argument: 'commandArg', flag: 'commandFlag', key: 'syntaxKeyword',
  path: 'filename', number: 'syntaxNumber', unit: 'muted', muted: 'muted', heading: 'mdHeading',
  emphasis: 'accent', subtle: 'dim', code: 'mdCode', warning: 'warning', error: 'error', success: 'success',
  'context-normal': 'statusLineContext', 'context-elevated': 'accent', 'context-high': 'warning', 'context-critical': 'error',
};

export function renderSpans(spans: readonly ReportSpan[]): string {
  return spans.map(item => defaultTheme.style(TOKENS[item.role], item.text,
    { bold: item.role === 'command' || item.role === 'heading' })).join('');
}

export interface ReportLayout {
  readonly rows: readonly string[];
  /** Original report line for each visual row; -1 identifies the title. */
  readonly sources: readonly number[];
}

export function renderReport(report: CommandReport, width: number): readonly string[] {
  return layoutReport(report, width).rows;
}

/** Every field survives narrow layouts; source text and styles remain separate. */
export function layoutReport(report: CommandReport, width: number): ReportLayout {
  if (width <= 0) return { rows: [], sources: [] };
  const rows = [...wrapToWidth(defaultTheme.style('mdHeading', report.title, { bold: true }), width), ''];
  const sources: number[] = rows.map(() => -1);
  const columns = report.columns ?? [];
  const widths = columns.map(column => Math.max(column.minWidth, visibleWidth(column.label)));
  for (const line of report.lines) if (line.kind === 'columns') {
    line.cells.forEach((cell, index) => { widths[index] = Math.max(widths[index] ?? 0, visibleWidth(spanText(cell))); });
  }
  const stacked = widths.reduce((sum, value) => sum + value, Math.max(0, widths.length - 1) * 2) > width;
  let table = false;
  for (const [index, line] of report.lines.entries()) {
    if (line.kind === 'space') rows.push('');
    else if (line.kind === 'columns') {
      if (stacked || !columns.length) {
        if (table) rows.push('');
        line.cells.forEach((cell, index) => rows.push(...wrapToWidth(
          `${columns[index] ? defaultTheme.style('muted', `${columns[index]!.label}: `, { bold: true }) : ''}${renderSpans(cell)}`, width)));
      } else {
        if (!table) rows.push(columns.map((column, index) => defaultTheme.style('muted', padToWidth(column.label, widths[index]!), { bold: true })).join('  '));
        rows.push(line.cells.map((cell, index) => {
          const content = renderSpans(cell);
          const pad = ' '.repeat(Math.max(0, widths[index]! - visibleWidth(content)));
          return columns[index]?.align === 'right' ? pad + content : content + pad;
        }).join('  '));
      }
    } else rows.push(...wrapToWidth(`${line.kind === 'text' && line.bullet ? '• ' : ''}${renderSpans(line.spans)}`, width));
    while (sources.length < rows.length) sources.push(index);
    table = line.kind === 'columns';
  }
  return { rows, sources };
}
