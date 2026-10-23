import { expect, it } from 'vitest';
import type { TranscriptEvent } from '../sessionEventCodec.js';
import { projectTranscriptMessages } from './sessionTranscript.js';

it.each(['branch_summary', 'compaction'] as const)('projects repeated %s records without revisiting the accumulated conversation', type => {
  const events: TranscriptEvent[] = [
    ...Array.from({ length: 19_999 }, (_, index) => ({ type: 'message' as const, id: `m-${index}`,
      role: 'user' as const, content: String(index), timestamp: '2026-01-01T00:00:00Z' })),
    ...Array.from({ length: 30_000 }, (_, index) => type === 'branch_summary'
      ? { type, id: `s-${index}`, summary: String(index), droppedTurns: 1, timestamp: '2026-01-01T00:00:00Z' }
      : { type, id: `s-${index}`, summary: String(index), keptMessages: 50_000, timestamp: '2026-01-01T00:00:00Z' }),
  ];
  const original = Array.prototype[Symbol.iterator];
  const slice = Array.prototype.slice;
  let revisited = 0;
  const count = (value: unknown): void => {
    if ((value as { role?: string; type?: string })?.role && !(value as { type?: string }).type
      && ++revisited > events.length * 4) throw new Error('Accumulated conversation was repeatedly copied.');
  };
  Array.prototype.slice = function (...args) {
    const result = slice.apply(this, args);
    for (const item of original.call(result)) count(item);
    return result;
  };
  Array.prototype[Symbol.iterator] = function* () {
    for (const item of original.call(this)) {
      count(item);
      yield item;
    }
  };
  let result: ReturnType<typeof projectTranscriptMessages> | undefined;
  try { expect(() => { result = projectTranscriptMessages(events); }).not.toThrow(); }
  finally { Array.prototype[Symbol.iterator] = original; Array.prototype.slice = slice; }
  expect(revisited).toBeLessThanOrEqual(events.length * 4);
  expect(result).toHaveLength(49_999);
  if (type === 'branch_summary') {
    expect(result![19_998].content).toBe('19998');
    expect(result![19_999]).toMatchObject({ content: '[Earlier Path]\n0', metadata: { contextSummary: 'branch' } });
    expect(result!.at(-1)?.content).toBe('[Earlier Path]\n29999');
  } else {
    expect(result![0].content).toBe('[Context Checkpoint]\n29999');
    expect(result![29_999].content).toBe('[Context Checkpoint]\n0');
    expect(result!.at(-1)?.content).toBe('19998');
  }
});

it('retains branch note order, empty content, timestamps and compaction kept/reset semantics', () => {
  const events: TranscriptEvent[] = [
    { type: 'message', id: 'old', role: 'assistant', content: 'old answer', timestamp: 't0' },
    { type: 'branch_summary', id: 'first', summary: 'first note', droppedTurns: 1, timestamp: 't1' },
    { type: 'branch_summary', id: 'empty', summary: '', droppedTurns: 1, timestamp: 't2' },
    { type: 'branch_summary', id: 'absent', droppedTurns: 0, timestamp: 't3' },
    { type: 'compaction', id: 'comp', summary: 'checkpoint', keptMessages: 2, timestamp: 't4' },
    { type: 'message', id: 'new', role: 'user', content: 'new question', timestamp: 't5' },
    { type: 'branch_summary', id: 'later', summary: 'later note', droppedTurns: 1, timestamp: 't6' },
  ];
  const before = structuredClone(events);
  expect(projectTranscriptMessages(events)).toMatchObject([
    { content: '[Context Checkpoint]\ncheckpoint', timestamp: 't4', metadata: { contextSummary: 'compaction' } },
    { content: '[Earlier Path]\nfirst note', timestamp: 't1', metadata: { contextSummary: 'branch' } },
    { content: '[Earlier Path]\n', timestamp: 't2', metadata: { contextSummary: 'branch' } },
    { id: 'new', content: 'new question', timestamp: 't5' },
    { content: '[Earlier Path]\nlater note', timestamp: 't6', metadata: { contextSummary: 'branch' } },
  ]);
  expect(projectTranscriptMessages([...events, { type: 'compaction', id: 'reset', summary: 'reset', keptMessages: 0, timestamp: 't7' }]))
    .toMatchObject([{ content: '[Context Checkpoint]\nreset', timestamp: 't7' }]);
  expect(events).toEqual(before);
});

it('matches historical kept-tail semantics across alternating notes, messages and compactions', () => {
  const events: TranscriptEvent[] = [];
  const keptCounts = [undefined, 0, 1, 2, 3, 50, 0.2, 1.5, Infinity];
  let expected: ReturnType<typeof projectTranscriptMessages> = [];
  for (let index = 0; index < 180; index++) {
    const timestamp = `t${index}`;
    if (index % 3 === 0) {
      events.push({ type: 'message', id: `m${index}`, role: 'user', content: String(index), timestamp });
      expected.push({ id: `m${index}`, role: 'user', content: String(index), timestamp });
    } else if (index % 3 === 1) {
      events.push({ type: 'branch_summary', id: `b${index}`, summary: String(index), droppedTurns: 1, timestamp });
      expected.push({ role: 'user', content: `[Earlier Path]\n${index}`, metadata: { contextSummary: 'branch' }, timestamp });
    } else {
      const keptMessages = keptCounts[Math.floor(index / 3) % keptCounts.length];
      events.push({ type: 'compaction', id: `c${index}`, summary: String(index), keptMessages, timestamp });
      const kept = keptMessages && keptMessages > 0 ? expected.slice(-keptMessages) : [];
      expected = [{ role: 'user', content: `[Context Checkpoint]\n${index}`, metadata: { contextSummary: 'compaction' }, timestamp }, ...kept];
    }
    expect(projectTranscriptMessages(events)).toEqual(expected);
  }
});

it('reclaims discarded message prefixes in batches without repeatedly moving a kept tail', () => {
  const events: TranscriptEvent[] = [];
  for (let batch = 0; batch < 40; batch++) {
    events.push(...Array.from({ length: 1000 }, (_, index) => ({ type: 'message' as const, id: `m${batch}-${index}`,
      role: 'user' as const, content: `${batch}-${index}`, timestamp: 't' })));
    events.push({ type: 'compaction', id: `c${batch}`, summary: String(batch), keptMessages: 10, timestamp: 't' });
  }
  const copy = Array.prototype.copyWithin;
  let reclaimed = 0;
  let moved = 0;
  Array.prototype.copyWithin = function (target, start, end) {
    reclaimed++;
    moved += (end ?? this.length) - start;
    return copy.call(this, target, start, end);
  };
  let result: ReturnType<typeof projectTranscriptMessages> | undefined;
  try { result = projectTranscriptMessages(events); }
  finally { Array.prototype.copyWithin = copy; }
  expect(reclaimed).toBe(40);
  expect(moved).toBe(400);
  expect(result).toHaveLength(11);
  expect(result![0].content).toBe('[Context Checkpoint]\n39');
  expect(result!.at(-1)?.content).toBe('39-999');
});
