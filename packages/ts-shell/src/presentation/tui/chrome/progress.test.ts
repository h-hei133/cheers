import { expect, it } from 'vitest';
import { stripAnsi } from '../text/ansi.js';
import { visibleWidth } from '../text/measure.js';
import { renderProgress } from './progress.js';

it('renders a determinate bar with a percentage and never exceeds the width', () => {
  const line = stripAnsi(renderProgress({ kind: 'determinate', label: 'quota', used: 50, total: 200 }, 40));
  expect(line).toContain('25%');
  expect(line).toContain('█');
  expect(line).toContain('░');
  expect(visibleWidth(renderProgress({ kind: 'determinate', label: 'quota', used: 50, total: 200 }, 40))).toBeLessThanOrEqual(40);
});

it('never invents a denominator for indeterminate or unknown work', () => {
  const indeterminate = stripAnsi(renderProgress({ kind: 'indeterminate', label: 'scanning' }, 40));
  const unknown = stripAnsi(renderProgress({ kind: 'unknown', label: 'usage' }, 40));
  expect(indeterminate).not.toMatch(/\d+%/);
  expect(unknown).not.toMatch(/\d+%/);
  expect(indeterminate).toContain('…');
  expect(unknown).toContain('unknown');
});

it('treats a zero, negative, or non-finite total as unknown rather than zero percent', () => {
  for (const total of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const line = stripAnsi(renderProgress({ kind: 'determinate', label: 'usage', used: 1, total }, 40));
    expect(line).toContain('unknown');
    expect(line).not.toMatch(/\d+%/);
  }
});

it('clamps the ratio and stays inside tiny widths', () => {
  expect(stripAnsi(renderProgress({ kind: 'determinate', label: 'x', used: 10, total: 5 }, 40))).toContain('100%');
  expect(stripAnsi(renderProgress({ kind: 'determinate', label: 'x', used: -1, total: 5 }, 40))).toContain('0%');
  for (const width of [0, 1, 2, 5, 10, 14, 15]) {
    expect(visibleWidth(renderProgress({ kind: 'determinate', label: 'long label', used: 1, total: 3 }, width))).toBeLessThanOrEqual(width);
  }
});
