import { expect, it } from 'vitest';
import { createReport, reportText, span } from './projection.js';

it('detaches and freezes a plain report snapshot including machine-readable facts', () => {
  const cells = [[span('provider')], [span(42, 'number')]];
  const facts = { status: 'reported', tokens: 42, labels: ['original'] };
  const report = createReport({ title: 'Usage', columns: [{ label: 'Source', minWidth: 6 }, { label: 'Tokens', minWidth: 6, align: 'right' }],
    lines: [{ kind: 'columns', cells }], facts });
  cells[1]![0] = span(99, 'error'); facts.labels[0] = 'edited';
  expect(reportText(report)).toContain('| provider | 42 |');
  expect(report.facts).toEqual({ status: 'reported', tokens: 42, labels: ['original'] });
  expect(Object.isFrozen(report.lines[0])).toBe(true);
  expect(JSON.parse(JSON.stringify(report))).toEqual(report);
});

it('keeps ANSI and other terminal controls out of source text and JSON data', () => {
  const report = createReport({ title: '\x1b[31mTitle\x1b[0m', lines: [
    { kind: 'text', spans: [{ text: '\x1b]52;c;YQ==\x07value\x00\r', role: 'text' }] },
  ], facts: { source: '\x1b[31mcatalog\x1b[0m' } });
  expect(report.title).toBe('Title');
  expect(reportText(report)).toContain('value\\u0000\\u000d');
  expect(report.facts.source).toBe('catalog');
  expect(reportText(report)).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/);
  expect(JSON.stringify(report)).not.toContain('u001b');
});
