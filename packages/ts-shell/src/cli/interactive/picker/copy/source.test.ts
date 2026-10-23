import { afterEach, expect, it, vi } from 'vitest';
import { Transcript } from '../../../../presentation/tui/transcript/container.js';
import { textBlock } from '../../../../presentation/tui/transcript/blocks.js';
import { CopySource, COPY_LIMITS, copySummary } from './source.js';

afterEach(() => vi.restoreAllMocks());

it('bounds source acquisition before building options and includes retained history', () => {
  const transcript = new Transcript();
  transcript.retainEarlier([textBlock('user', 'old source')]);
  transcript.append(textBlock('assistant', 'new source'));
  const combined = vi.spyOn(transcript, 'copyable');
  const source = new CopySource(transcript);
  expect(combined).not.toHaveBeenCalled();
  expect(source.page('', 0, 100).entries.map(entry => entry.text)).toEqual(['new source', 'old source']);
  expect(source.page('old', 0, 100).entries[0]).toMatchObject({ id: '1', text: 'old source' });
});

it('refuses excess blocks and text without silently dropping older sources', () => {
  const transcript = new Transcript();
  for (let index = 0; index < COPY_LIMITS.blocks; index++) transcript.append(textBlock('assistant', 'source'));
  expect(new CopySource(transcript).page('', 0, 0).total).toBe(COPY_LIMITS.blocks);
  transcript.append(textBlock('assistant', 'one too many'));
  expect(() => new CopySource(transcript)).toThrow('copy browsing limits');
  const large = new Transcript();
  large.append(textBlock('assistant', '界'.repeat(COPY_LIMITS.textUnits)));
  expect(() => new CopySource(large)).toThrow('copy browsing limits');
});

it('reuses a complete-source search across pages and replaces it on query changes', () => {
  const transcript = new Transcript();
  for (let index = 0; index < 205; index++) transcript.append(textBlock('assistant', `answer ${index}\nARCHIVED`));
  const source = new CopySource(transcript);
  expect(source.page('archived', 0, 100)).toMatchObject({ total: 205, entries: expect.any(Array) });
  const lower = vi.spyOn(String.prototype, 'toLowerCase');
  const second = source.page('archived', 100, 100);
  const third = source.page('archived', 200, 100);
  const repeatedReads = lower.mock.calls.length;
  const changed = source.page('answer 0', 0, 100);
  const changedReads = lower.mock.calls.length;
  lower.mockRestore();
  expect(second.entries[0]?.text).toBe('answer 104\nARCHIVED');
  expect(third.entries).toHaveLength(5);
  expect(repeatedReads).toBe(0);
  expect(changed.entries.map(entry => entry.id)).toEqual(['204']);
  expect(changedReads).toBe(205);
  expect(source.page('', 0, 100).total).toBe(205);
});

it('keeps first non-empty-line summary semantics without splitting the full source', () => {
  const split = vi.spyOn(String.prototype, 'split');
  expect(copySummary(' \r\n\t\n  exact 😀\r\n' + 'tail\n'.repeat(100_000))).toBe('exact 😀');
  expect(copySummary('x'.repeat(90))).toBe('x'.repeat(69) + '…');
  expect(copySummary('\n  \n\t')).toBe('');
  expect(split).not.toHaveBeenCalled();
});

it('honors cancellation before acquiring any source', () => {
  const transcript = new Transcript();
  transcript.append(textBlock('assistant', 'source'));
  expect(() => new CopySource(transcript, AbortSignal.abort())).toThrow();
});
