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
