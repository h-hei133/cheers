import { expect, it } from 'vitest';
import { createReport, plainReportText, reportText, span } from './projection.js';
import { readReport, REPORT_BYTES } from './codec.js';

it('restores supported report semantics as a safe detached snapshot', () => {
  const report = createReport({ title: 'Metrics', columns: [{ label: 'Value', minWidth: 8 }],
    lines: [{ kind: 'columns', cells: [[span('unknown', 'warning')]] }], facts: { value: null, unit: 'ms', count: 0 } });
  const restored = readReport(JSON.parse(JSON.stringify(report)))!;
  expect(restored).toEqual(report);
  expect(Object.isFrozen(restored.facts)).toBe(true);
  expect(reportText(restored)).toBe(reportText(report));
  expect(plainReportText('a\n\x1b[31mb\x1b[0m\t\x1b]0;title\x07')).toBe('a\nb\\u0009');
});

it('declines unsupported, malformed and excessive semantics without dropping fallback text', () => {
  const report = { version: 1, title: 'Report', lines: [{ kind: 'text', spans: [{ role: 'warning', text: 'safe' }] }], facts: {} };
  for (const invalid of [null, { ...report, version: 2 }, { ...report, lines: [null] },
    { ...report, lines: [{ kind: 'text', spans: [{ text: 'bad', role: 'new-role' }] }] },
    { ...report, columns: [{ label: 'bad', minWidth: -1 }] }, { ...report, facts: { value: Infinity } },
    { ...report, title: 'x'.repeat(REPORT_BYTES + 1) }]) expect(readReport(invalid)).toBeUndefined();
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  expect(readReport({ ...report, facts: cycle })).toBeUndefined();
  const expanded = { ...report, columns: [{ label: 'x'.repeat(100000), minWidth: 1 }],
    lines: Array.from({ length: 20 }, () => [{ kind: 'columns', cells: [[span('1')]] }, { kind: 'space' }]).flat() };
  expect(Buffer.byteLength(JSON.stringify(expanded))).toBeLessThan(REPORT_BYTES);
  expect(readReport(expanded)).toBeUndefined();
  expect(readReport({ ...report, lines: [{ kind: 'text', spans: [{ role: 'warning', text: '\x1b[31msafe\x1b[0m' }] }] })?.lines)
    .toEqual(report.lines);
});
