import { expect, it } from 'vitest';
import { textBlock } from './blocks.js';
import { Transcript } from './container.js';
import { TranscriptPane } from '../surface/pane.js';
import { joinSourceLines, projectText, sourceLinesFor } from './source.js';
import { stripAnsi } from '../text/ansi.js';
import { renderMarkdown } from './markdown.js';

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

it('copies a wrapped formatted table from its original Markdown source', () => {
  const source = [
    '| Name | Description |',
    '| :--- | :--- |',
    '| alpha | this is a long description that wraps |',
  ].join('\n');
  const transcript = new Transcript();
  transcript.append(textBlock('assistant', source));
  const pane = new TranscriptPane(transcript);
  const painted = pane.render(40, 20, undefined);
  const first = painted.findIndex(row => stripAnsi(row).includes('Name'));
  const last = painted.findIndex((row, index) => index >= first && stripAnsi(row).includes('long description'));
  const continuation = painted.findIndex((row, index) => index > last && row.trim().length > 0);
  expect(first).toBeGreaterThanOrEqual(0);
  expect(last).toBeGreaterThan(first);
  expect(continuation).toBeGreaterThan(last);
  expect(pane.extractSource({ row: first, column: 0 }, { row: continuation, column: 39 })).toBe(source);
  expect(pane.extractSource({ row: continuation, column: 0 }, { row: continuation, column: 39 })).toBeUndefined();
});

it.each([
  ['heading', '# a heading that wraps before the next source line\nnext line'],
  ['paragraph', 'a paragraph that wraps before the next source line\nnext line'],
  ['list', '- a list item that wraps before the next source line\nnext line'],
  ['code', '```ts\nconst wrappedCodeLineThatIsLong = "abcdefghijklmnopqrstuvwxyz";\nnextCodeLine();\n```'],
])('preserves the logical break after a wrapped Markdown %s node', (_kind, source) => {
  const width = 24;
  const block = textBlock('assistant', source);
  const rows = renderMarkdown(source, width);
  const projected = sourceLinesFor(block, 0, width, [...rows, '']);
  expect(projected.some(line => line?.breakAfter === 'soft')).toBe(true);
  expect(joinSourceLines(projected.filter(line => line !== undefined))).toBe(source);
});

it('copies a fenced block whose body contains a blank source line without decoration', () => {
  const source = '```ts\na\n\nb\n```';
  const transcript = new Transcript();
  transcript.append(textBlock('assistant', source));
  const pane = new TranscriptPane(transcript);
  const painted = pane.render(20, 20, undefined);
  const first = painted.findIndex(row => stripAnsi(row).includes('┌'));
  const last = painted.findIndex(row => stripAnsi(row).includes('└'));
  expect(first).toBeGreaterThanOrEqual(0);
  expect(last).toBeGreaterThan(first);
  expect(pane.extractSource({ row: first, column: 0 }, { row: last, column: 19 })).toBe(source);
});

it('copies an empty fenced block without inventing a body row', () => {
  const source = '```ts\n```';
  const transcript = new Transcript();
  transcript.append(textBlock('assistant', source));
  const pane = new TranscriptPane(transcript);
  const painted = pane.render(20, 20, undefined);
  const first = painted.findIndex(row => stripAnsi(row).includes('┌'));
  const last = painted.findIndex(row => stripAnsi(row).includes('└'));
  expect(first).toBeGreaterThanOrEqual(0);
  expect(last).toBe(first + 1);
  expect(pane.extractSource({ row: first, column: 0 }, { row: last, column: 19 })).toBe(source);
});
