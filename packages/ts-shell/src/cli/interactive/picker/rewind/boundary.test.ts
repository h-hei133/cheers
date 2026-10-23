import { afterEach, expect, it, vi } from 'vitest';
import { rewindPicker, rewindPoints } from '../rewind.js';
import { pickerFor } from '../registry.js';

afterEach(() => vi.restoreAllMocks());
const turns = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: `question-${index}`, role: 'user' as const, content: `question ${index}\nARCHIVED`,
}));

it('consumes closed, selected and transferred question pages once', async () => {
  const rewind = vi.fn(async () => ({ draft: 'original' }));
  const closed = rewindPicker({ turns: turns(26), rewind });
  await closed.load(); closed.previewEnd?.();
  expect(await closed.apply(['question-25'])).toBeUndefined();
  expect(closed.filterOptions!('archived', [])).toEqual([]);
  await expect(closed.load()).rejects.toThrow('closed');
  const first = rewindPicker({ turns: turns(26), rewind });
  await first.load(); const next = (await first.apply(['__more__']))!.next!;
  expect(await first.apply(['question-25'])).toBeUndefined();
  expect(first.filterOptions!('', [])).toEqual([]);
  expect((await next.load())[0]?.id).toBe('question-0');
  expect(await next.apply(['question-0'])).toEqual({ draft: 'original' });
  expect(await next.apply(['question-0'])).toBeUndefined();
  expect(rewind).toHaveBeenCalledTimes(1);
});

it('reuses the current complete-query matches across continuation pages', async () => {
  const first = rewindPicker({ turns: turns(60), rewind: vi.fn() });
  await first.load(); expect(first.filterOptions!('archived', [])).toHaveLength(26);
  const lower = vi.spyOn(String.prototype, 'toLowerCase');
  const second = (await first.apply(['__more__']))!.next!;
  const rows = await second.load();
  const count = lower.mock.calls.length; lower.mockRestore();
  expect(rows[0]?.id).toBe('question-34');
  expect(count).toBeLessThan(10);
  expect(second.filterOptions!('question 0', []).map(row => row.id)).toEqual(['question-0']);
});

it('keeps multiline summaries without splitting the full question', async () => {
  const picker = rewindPicker({ turns: [{ id: 'question', role: 'user', content: ' \n\t\n  exact 😀\r\n' + 'tail\n'.repeat(100_000) }], rewind: vi.fn() });
  const split = vi.spyOn(String.prototype, 'split');
  const rows = await picker.load(); const calls = split.mock.calls.length; split.mockRestore();
  expect(rows[0]?.label).toBe('exact 😀'); expect(calls).toBe(0);
});

it('rejects excess turns, questions, content parts and text before offering a clipped list', async () => {
  expect(() => rewindPoints(turns(20_001))).toThrow('browsing limits');
  expect(() => rewindPoints(Array.from({ length: 50_001 }, () => ({ role: 'assistant', content: '' })))).toThrow('browsing limits');
  expect(() => rewindPoints([{ id: 'large', role: 'user', content: '界'.repeat(32 * 1024 * 1024) }])).toThrow('browsing limits');
  expect(() => rewindPoints([{ id: 'parts', role: 'user', content: Array.from({ length: 50_001 }, () => ({ type: 'text' as const, text: '' })) }])).toThrow('browsing limits');
  expect(() => rewindPoints([{ id: 'same', role: 'user', content: 'older' }, { id: 'same', role: 'user', content: 'newer' }])).toThrow('identity');
});

it('uses the original host admission before acquisition and each fresh navigation', async () => {
  let issue: string | undefined;
  const sessionTurns = vi.fn(() => turns(26)); const rewind = vi.fn();
  const host = { commandContext: { admission: () => issue }, sessionTurns, rewind } as never;
  issue = 'The session changed.';
  const denied = pickerFor('/back', host)!;
  expect(sessionTurns).not.toHaveBeenCalled();
  await expect(denied.load()).rejects.toThrow();
  issue = undefined; const first = pickerFor('/back', host)!; await first.load();
  const second = (await first.apply(['__more__']))!.next!; await second.load();
  issue = 'The session changed.';
  expect(await second.apply(['question-0'])).toEqual({ note: 'The session changed.' });
  expect(rewind).not.toHaveBeenCalled();
  issue = undefined; expect(await second.apply(['question-0'])).toBeUndefined();
});

it('gives numeric exact identities priority over ordinal selectors', async () => {
  const picker = rewindPicker({ turns: [{ id: '2', role: 'user', content: 'older exact' },
    { id: 'new', role: 'user', content: 'newer' }], selector: '2', rewind: vi.fn() });
  expect(picker.initialSelection).toBe('2');
  const newest = rewindPicker({ turns: [{ id: '2', role: 'user', content: 'exact newest' },
    { id: 'old', role: 'user', content: 'ordinal second' }].reverse(), selector: '2', rewind: vi.fn() });
  expect(newest.initialSelection).toBe('2');
});

it('keeps the opening saved version on every page and selection without reacquiring the source', async () => {
  const read = vi.fn(() => ({ turns: turns(60), version: 'saved-v1' }));
  const rewind = vi.fn(async () => ({ draft: 'original' }));
  const first = pickerFor('/back', { commandContext: { cwd: '/workspace' }, sessionTurns: read, rewind } as never)!;
  await first.load();
  const second = (await first.apply(['__more__']))!.next!; await second.load();
  const third = (await second.apply(['__more__']))!.next!; await third.load();
  await third.apply(['question-0']);
  expect(read).toHaveBeenCalledTimes(1);
  expect(rewind).toHaveBeenCalledWith({ entryId: 'question-0', prompt: 'question 0\nARCHIVED', dropped: 59, version: 'saved-v1' });
});
