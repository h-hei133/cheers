import { afterEach, beforeEach, expect, it } from 'vitest';
import { createReport, reportText, span } from '../../../core/commands/report/projection.js';
import { defaultTheme } from '../../theme/theme.js';
import { getDefaultTheme } from '../../themes/index.js';
import { Transcript } from '../transcript/container.js';
import { Pager, pageLongOutput } from '../chrome/pager.js';
import { stripAnsi } from '../text/ansi.js';
import { visibleWidth } from '../text/measure.js';
import { renderReport } from './renderer.js';

let restore: () => void;
beforeEach(() => { restore = defaultTheme.snapshot(); defaultTheme.apply(getDefaultTheme(), 'truecolor'); });
afterEach(() => restore());

function fixture() {
  return createReport({ title: 'Context', columns: [{ label: 'Value', minWidth: 8 }, { label: 'Source', minWidth: 10 }],
    lines: [{ kind: 'text', spans: [span('/compact', 'command'), span(' 75.0%', 'context-high')] },
      ...Array.from({ length: 24 }, (_, index) => ({ kind: 'columns' as const,
        cells: [[span(`条目${index}`, 'number')], [span(`provider-reported-${index}`)]] }))],
    facts: { status: 'reported' } });
}

it('styles declared spans and stacks every field on narrow screens', () => {
  const report = fixture();
  const wide = renderReport(report, 80).join('\n');
  expect(wide).toContain(defaultTheme.style('command', '/compact', { bold: true }));
  expect(wide).toContain(defaultTheme.fg('warning', ' 75.0%'));
  const narrow = renderReport(report, 20);
  expect(narrow.every(row => visibleWidth(row) <= 20)).toBe(true);
  const content = narrow.map(stripAnsi).join('');
  for (let index = 0; index < 24; index++) {
    expect(content).toContain(`条目${index}`);
    expect(content).toContain(`provider-reported-${index}`);
  }
  expect(content).toContain('Source:');
  expect(reportText(report)).not.toContain('\x1b');
});

it('recolors retained reports in both transcript and pager without changing copy text', () => {
  const report = fixture(); const text = reportText(report);
  const transcript = new Transcript();
  const block = transcript.append({ kind: 'command', title: '/context', text, report, finalized: true });
  const dark = transcript.render(80).rows.join('\n');
  const pager = new Pager();
  expect(pageLongOutput(pager, '/context', block, transcript)).toBe(true);
  expect(block.text).toBe(text); expect(pager.text).toBe(text);
  const darkPage = pager.render(80, 12).join('\n');
  defaultTheme.apply(getDefaultTheme('light'), 'truecolor');
  const lightPage = pager.render(80, 12).join('\n');
  expect(darkPage).not.toContain(defaultTheme.fg('warning', ' 75.0%'));
  expect(lightPage).toContain(defaultTheme.fg('warning', ' 75.0%'));
  expect(lightPage).not.toBe(darkPage); expect(stripAnsi(lightPage)).toBe(stripAnsi(darkPage));
  pager.handleKey('escape', undefined, 12);
  transcript.setCollapsed(block, false);
  const light = transcript.render(80).rows.join('\n');
  expect(light).not.toBe(dark); expect(stripAnsi(light)).toBe(stripAnsi(dark));
  expect(block.text).toBe(text);
});


it('searches visible words across independently styled spans', () => {
  const report = fixture(); const pager = new Pager();
  pager.open('/context', reportText(report), report); pager.render(80, 12);
  pager.handleKey('text', '/compact 75.0%', 12);
  const rows = pager.render(80, 12).slice(2, -1).map(stripAnsi).join('\n');
  expect(rows).toContain('/compact 75.0%');
  expect(rows).not.toContain('provider-reported');
});
