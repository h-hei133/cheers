import { afterEach, expect, it, vi } from 'vitest';
import { rewindPicker } from '../rewind.js';
import { REWIND_LIMITS, RewindSource, rewindPoints } from './source.js';

afterEach(() => vi.restoreAllMocks());

it('admits the exact question boundary and refuses the next point', () => {
  const turns = Array.from({ length: REWIND_LIMITS.questions }, (_, index) => ({ id: String(index), role: 'user' as const, content: 'question' }));
  expect(rewindPoints(turns)).toHaveLength(REWIND_LIMITS.questions);
  turns.push({ id: 'excess', role: 'user', content: 'question' });
  expect(() => rewindPoints(turns)).toThrow('browsing limits');
});

it('admits the exact turn boundary even when no question can be selected', () => {
  const turns = Array.from({ length: REWIND_LIMITS.turns }, () => ({ role: 'assistant' as const, content: '' }));
  expect(rewindPoints(turns)).toEqual([]);
  turns.push({ role: 'assistant', content: '' });
  expect(() => rewindPoints(turns)).toThrow('browsing limits');
});

it('counts exact text units including IDs and multimodal join separators before joining', () => {
  const content = [{ type: 'text' as const, text: '界'.repeat(REWIND_LIMITS.textUnits - 4) },
    { type: 'image' as const, data: 'opaque', mimeType: 'image/png' }, { type: 'text' as const, text: 'x' }];
  const turn = { id: 'id', role: 'user' as const, content };
  const admitted = rewindPoints([turn]);
  expect(admitted[0]?.prompt.length).toBe(REWIND_LIMITS.textUnits - 2);
  content[2] = { type: 'text', text: 'xx' };
  const join = vi.spyOn(Array.prototype, 'join');
  let failed = false;
  try { rewindPoints([turn]); } catch { failed = true; }
  const joined = join.mock.calls.length; join.mockRestore();
  expect(failed).toBe(true); expect(joined).toBe(0);
});

it('counts empty and image content parts before text projection', () => {
  const content = Array.from({ length: REWIND_LIMITS.parts }, () => ({ type: 'image' as const, data: '', mimeType: 'image/png' }));
  expect(rewindPoints([{ id: 'images', role: 'user', content }])).toEqual([]);
  content.push({ type: 'image', data: '', mimeType: 'image/png' });
  expect(() => rewindPoints([{ id: 'images', role: 'user', content }])).toThrow('browsing limits');
});

it('preserves literal prompts and dropped counts while ignoring durable context messages', () => {
  const source = new RewindSource([
    { id: 'older', role: 'user', content: '  exact\r\n😀  ' },
    { role: 'assistant', content: 'answer' },
    { role: 'system', content: 'context', metadata: { contextSummary: 'branch' } },
    { id: 'newer', role: 'user', content: [{ type: 'text', text: 'new' }, { type: 'text', text: 'question' }] },
    { role: 'tool', content: 'tool' },
  ]);
  expect(source.page('', 0, 25).entries).toEqual([
    { entryId: 'newer', prompt: 'new\nquestion', dropped: 1 },
    { entryId: 'older', prompt: '  exact\r\n😀  ', dropped: 3 },
  ]);
});

it('stops an aborted opening and refuses an unreadable source visibly', async () => {
  expect(() => new RewindSource([{ id: 'q', role: 'user', content: 'q' }], AbortSignal.abort())).toThrow();
  const rewind = vi.fn();
  const picker = rewindPicker({ turns: [{ id: 'q', role: 'user', content: 'q' }], rewind, admission: () => { throw new Error('private issue'); } });
  await expect(picker.load()).rejects.toThrow('unavailable');
  expect(await picker.apply(['q'])).toBeUndefined();
  expect(rewind).not.toHaveBeenCalled();
});

it('stops search-index construction when cancelled between questions', async () => {
  const controller = new AbortController();
  const lower = vi.spyOn(String.prototype, 'toLowerCase');
  lower.mockImplementationOnce(function (this: string) {
    controller.abort();
    return this.toString();
  });
  const turns = Array.from({ length: 300 }, (_, index) => ({
    id: `question-${index}`,
    role: 'user' as const,
    content: `question ${index}`,
  }));

  await expect(RewindSource.create(turns, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(lower).toHaveBeenCalledTimes(1);
});
