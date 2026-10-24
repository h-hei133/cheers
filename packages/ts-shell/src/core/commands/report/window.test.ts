import { expect, it, vi } from 'vitest';
import { boundedReport } from './window.js';
import { ReportLimitError } from './contract.js';
import { readReport } from './codec.js';
import { reportText, span } from './projection.js';

it('projects an ordinary captured window once', () => {
  const build = vi.fn((shown: readonly string[]) => ({ title: 'Rows',
    lines: shown.map(text => ({ kind: 'text' as const, spans: [span(text)] })), facts: { shown: shown.length } }));
  const report = boundedReport(['one', 'two'], build);
  expect(build).toHaveBeenCalledOnce(); expect(report.facts.shown).toBe(2);
  expect(readReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
});

it('fits control expansion with a valid zero-prefix omission and preserves unrelated errors', () => {
  const report = boundedReport(['\0'.repeat(200_000)], shown => ({ title: 'Rows',
    lines: shown.map(text => ({ kind: 'text', spans: [span(text)] })),
    facts: { shown: shown.length, omitted: 1 - shown.length } }));
  expect(report.facts).toEqual({ shown: 0, omitted: 1 });
  expect(readReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  for (const error of [new RangeError('producer range'), new TypeError('producer type')]) {
    expect(() => boundedReport([1], shown => {
      if (shown.length) throw error;
      return { title: 'Rows', lines: [], facts: {} };
    })).toThrow(error);
  }
  expect(() => boundedReport([], () => ({ title: 'x'.repeat(1024 * 1024 + 1), lines: [], facts: {} })))
    .toThrow(ReportLimitError);
});

it('fits the decoder structural node budget as well as snapshot and text budgets', () => {
  const items = Array.from({ length: 5000 }, (_, i) => i);
  const produce = () => boundedReport(items, shown => ({ title: 'Rows',
    lines: shown.map(() => ({ kind: 'columns' as const, cells: [[]] })), facts: { shown: shown.length } }));
  expect(produce).not.toThrow();
  const report = produce();
  expect(report.facts.shown).toBeGreaterThan(0); expect(report.facts.shown).toBeLessThan(5000);
  expect(readReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  expect(reportText(report)).toContain('Rows'); expect(items).toHaveLength(5000);
});

it('rejects malformed producer facts rather than hiding them as omitted entries', () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const malformed of [() => undefined, cycle]) {
    expect(() => boundedReport([malformed], shown => ({ title: 'Invalid', lines: [],
      facts: { values: shown as never } }))).toThrow(TypeError);
  }
});
