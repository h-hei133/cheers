import { expect, it } from 'vitest';
import { TranscriptPane } from './pane.js';
import { Transcript } from '../transcript/container.js';
import { stripAnsi } from '../text/ansi.js';

const diff = ['--- a/file.txt', '+++ b/file.txt', '@@ -1 +1 @@', '-old line', '+new line'].join('\n');

it('copies the old or new side of a side-by-side diff row', () => {
  const transcript = new Transcript();
  transcript.append({ kind: 'command', title: 'edit', text: '', diff, finalized: true });
  const pane = new TranscriptPane(transcript);
  const rows = pane.render(120, 30, undefined);
  const row = rows.findIndex(line => stripAnsi(line).includes('old line'));
  expect(row).toBeGreaterThan(0);
  const oldColumn = stripAnsi(rows[row]!).indexOf('old line');
  expect(pane.extractSource(
    pane.screenToContent(row, oldColumn + 2),
    pane.screenToContent(row, oldColumn + 5),
  )).toBe('old line');
  const divider = stripAnsi(rows[row]!).lastIndexOf('│');
  expect(divider).toBeGreaterThan(0);
  expect(pane.extractSource(
    pane.screenToContent(row, divider + 2),
    pane.screenToContent(row, divider + 8),
  )).toBe('new line');
});

it('copies a side from a framed tool-card diff', () => {
  const transcript = new Transcript();
  transcript.append({ kind: 'tool', title: 'edit', text: '', diff, finalized: true });
  const pane = new TranscriptPane(transcript);
  const rows = pane.render(120, 30, undefined);
  const row = rows.findIndex(line => stripAnsi(line).includes('old line'));
  expect(row).toBeGreaterThan(0);
  const oldColumn = stripAnsi(rows[row]!).indexOf('old line');
  expect(pane.extractSource(
    pane.screenToContent(row, oldColumn + 2),
    pane.screenToContent(row, oldColumn + 5),
  )).toBe('old line');
  const divider = stripAnsi(rows[row]!).lastIndexOf('│');
  expect(divider).toBeGreaterThan(2);
  expect(pane.extractSource(
    pane.screenToContent(row, divider + 2),
    pane.screenToContent(row, divider + 8),
  )).toBe('new line');
});

it.each(['command', 'tool'] as const)('copies wrapped %s diff fragments across padding without copying display breaks', kind => {
  const previous = 'é🙂'.repeat(42) + ' old tail';
  const next = 'short replacement';
  const transcript = new Transcript();
  transcript.append({ kind, title: 'edit', text: '', diff: `@@ -1,2 +1,2 @@\n-${previous}\n+${next}\n context`, finalized: true });
  const pane = new TranscriptPane(transcript);
  const rows = pane.render(120, 30, undefined).map(stripAnsi);
  const first = rows.findIndex(line => line.includes(next));
  const last = rows.findIndex(line => line.includes('old tail'));
  const context = rows.findIndex(line => line.includes('context'));
  const oldColumn = rows[first]!.indexOf('é');
  const rightColumn = rows[first]!.indexOf('│', oldColumn) + 2;
  expect(last).toBeGreaterThan(first);
  expect(pane.extractSource(pane.screenToContent(first, oldColumn), pane.screenToContent(last, oldColumn))).toBe(previous);
  expect(pane.extractSource(pane.screenToContent(first, rightColumn), pane.screenToContent(context, rightColumn))).toBe(`${next}\ncontext`);
});
