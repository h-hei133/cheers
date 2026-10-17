import { expect, it } from 'vitest';
import { textBlock } from './blocks.js';
import { Transcript } from './container.js';
import { TranscriptPane } from '../surface/pane.js';
import { joinSourceLines, projectText, sourceLinesFor } from './source.js';

it('marks every wrap point as soft and every source newline as logical', () => {
  const lines = projectText('abcdefgh\nij', 4);
  expect(lines.map(line => line.text)).toEqual(['abcd', 'efgh', 'ij']);
  expect(lines.map(line => line.breakAfter)).toEqual(['soft', 'logical', 'logical']);
  expect(joinSourceLines(lines.map(line => ({ ...line, block: 0 })))).toBe('abcdefgh\nij');
});

it('refuses a projection when rendered rows and source lines disagree', () => {
  const block = textBlock('assistant', 'one two');
  expect(sourceLinesFor(block, 0, 40, ['decorated', 'rows']).every(line => line === undefined)).toBe(true);
  const matching = sourceLinesFor(block, 0, 40, ['one two', '']);
  expect(matching[0]?.text).toBe('one two');
  expect(matching[1]).toBeUndefined();
});

it('copies a full-row selection from source, without padding or soft wraps', () => {
  const transcript = new Transcript();
  transcript.append(textBlock('user', 'hello world this wraps\nsecond line'));
  const pane = new TranscriptPane(transcript);
  const painted = pane.render(20, 8, undefined);
  const first = painted.findIndex(row => row.includes('hello'));
  const last = painted.findIndex(row => row.includes('second line'));
  const copy = pane.extractSource({ row: first, column: 0 }, { row: last, column: 19 });
  expect(copy).toBe('hello world this wraps\nsecond line');
});

it('does not copy when the selection starts mid-row or crosses a decoration row', () => {
  const transcript = new Transcript();
  transcript.append(textBlock('user', 'alpha'));
  const pane = new TranscriptPane(transcript);
  pane.render(20, 4, undefined);
  expect(pane.extractSource({ row: 3, column: 3 }, { row: 3, column: 19 })).toBeUndefined();
  // Row 4 is the block's trailing separator and has no source line.
  expect(pane.extractSource({ row: 3, column: 0 }, { row: 4, column: 19 })).toBeUndefined();
});
