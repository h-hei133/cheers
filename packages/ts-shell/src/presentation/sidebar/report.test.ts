import { expect, it } from 'vitest';
import { sidebarReport } from './report.js';
import { createSidebarPanel, createSidebarPanelSection } from './sidebarPanelModel.js';
import { reportText } from '../../core/commands/report/projection.js';
import { renderReport } from '../tui/report/renderer.js';
import { stripAnsi } from '../tui/text/ansi.js';

it('keeps warning sources and redaction while narrow rendering retains the full logical line', () => {
  const panel = createSidebarPanel({ budget: { maxLines: 10 }, sections: [createSidebarPanelSection({ id: 'memory', title: 'Memory',
    lines: [{ text: `${'detail '.repeat(35)}END_SOURCE RAW_FILE_CONTENT`, severity: 'warning', sourceId: 'RAW_EVENT_CONTENT' }] })] });
  const report = sidebarReport(panel);
  expect(report.lines.find(line => line.kind === 'text')).toMatchObject({ spans: [{ role: 'warning' }] });
  expect(reportText(report)).toContain('END_SOURCE');
  expect(stripAnsi(renderReport(report, 35).join('\n'))).toContain('END_SOURCE');
  expect(JSON.stringify(report)).not.toContain('RAW_FILE_CONTENT'); expect(JSON.stringify(report)).not.toContain('RAW_EVENT_CONTENT');
  expect(report.facts.sections).toMatchObject([{ id: 'memory', lines: [{ sourceId: '[REDACTED_RAW]' }] }]);
  expect(Object.isFrozen(report.facts.sections)).toBe(true);
});

it('retains the existing forbidden-content rejection boundary for supplied panel data', () => {
  const panel = createSidebarPanel({ sections: [{ id: 'memory', title: 'Memory', severity: 'error',
    lines: [{ text: 'RAW_FILE_CONTENT', severity: 'error' }] }] });
  expect(() => sidebarReport(panel)).toThrow('rejected forbidden content');
});
