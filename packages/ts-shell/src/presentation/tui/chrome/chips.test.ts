import { expect, it } from 'vitest';
import { stripAnsi } from '../text/ansi.js';
import { visibleWidth } from '../text/measure.js';
import { renderChips, type Chip } from './chips.js';

const chips: Chip[] = Array.from({ length: 10 }, (_, index) => ({ id: `c${index}`, label: `chip${index}` }));

it('keeps the active chip visible when the strip is narrower than its content', () => {
  const line = stripAnsi(renderChips(chips, 'c8', 20));
  expect(line).toContain('chip8');
  expect(visibleWidth(renderChips(chips, 'c8', 20))).toBeLessThanOrEqual(20);
  expect(line.startsWith('…')).toBe(true);
});

it('shows counts and marks overflow on the right', () => {
  const line = stripAnsi(renderChips([{ id: 'a', label: 'all', count: 12 }, { id: 'b', label: 'two' }], 'a', 40));
  expect(line).toContain('all 12');
  expect(visibleWidth(renderChips([{ id: 'a', label: 'all', count: 12 }], 'a', 40))).toBeLessThanOrEqual(40);
});

it('stays inside the width for empty, zero, and wide-glyph labels', () => {
  expect(renderChips([], 'x', 20)).toBe('');
  expect(renderChips(chips, 'c0', 0)).toBe('');
  const cjk = [{ id: 'a', label: '模型' }, { id: 'b', label: '连接' }];
  for (const width of [1, 3, 5, 8, 12]) {
    expect(visibleWidth(renderChips(cjk, 'b', width))).toBeLessThanOrEqual(width);
  }
});
