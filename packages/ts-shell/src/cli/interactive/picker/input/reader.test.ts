import { expect, it } from 'vitest';
import { InputReader } from './reader.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { cursorTarget } from '../../../../presentation/tui/render/paint.js';

it('walks every source page forward and backward, retaining boundary graphemes and explicit part identity', () => {
  const source = 'a'.repeat(4094) + '😀é' + 'b'.repeat(4100) + '\nTAIL';
  const reader = new InputReader(source);
  const text = () => reader.render(10000, 10).map(stripAnsi).join('\n');
  const first = text(); expect(first).toBe('a'.repeat(4094) + '😀'); expect(reader.position).toContain('more follows');
  reader.pan(1); const second = text(); expect(second.startsWith('é')).toBe(true);
  reader.pan(1); const third = text(); expect(third).toContain('TAIL'); expect(reader.position).toContain('end');
  expect(first + second + third).toBe(source);
  reader.pan(-1); expect(text()).toBe(second);
  reader.pan(-1); expect(text()).toBe(first);
  reader.pan(-1); expect(text()).toBe(first);
  reader.key('ctrl+end'); expect(text()).toBe(third);
  reader.key('ctrl+home'); expect(text()).toBe(first);
});

it('retains all lines across natural page boundaries and follows the caret after narrow reflow', () => {
  const source = Array.from({ length: 200 }, (_, i) => `entry-${i} 中文😀 ` + 'x'.repeat(25)).join('\n');
  const reader = new InputReader(source);
  let shown = reader.render(80, 500).map(stripAnsi).join('\n');
  expect(shown).toContain('entry-0');
  while (!reader.position.includes('end')) {
    reader.pan(1); shown += '\n' + reader.render(80, 500).map(stripAnsi).join('\n');
  }
  expect(shown).toBe(source);
  reader.key('ctrl+end'); const narrow = reader.render(8, 1);
  expect(narrow.map(stripAnsi).join('\n')).toBe('x'); expect(cursorTarget(narrow, 0, 1)).toEqual({ row: 0, column: 1 });
  reader.key('ctrl+home'); expect(reader.render(18, 4).map(stripAnsi).join('\n')).toContain('entry-0');
});

it('rejects an overlong individual grapheme explicitly instead of splitting it or allocating full layout', () => {
  expect(() => new InputReader('a' + '\u0301'.repeat(9000))).toThrow('character exceeds');
  const reader = new InputReader('x'.repeat(4096) + 'a' + '\u0301'.repeat(9000));
  reader.render(80, 1000);
  expect(() => reader.pan(1)).toThrow('character exceeds');
  expect(reader.position).toBe('Part 1 · more follows');
});
