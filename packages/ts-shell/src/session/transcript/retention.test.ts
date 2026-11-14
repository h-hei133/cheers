import { expect, it, vi } from 'vitest';
import { TranscriptRetention } from './retention.js';
import type { SessionMessage } from '../schema/sessionMessage.js';
import type { TranscriptEvent } from '../sessionEventCodec.js';
import { createMessageTranscriptEvent } from '../sessionEventCodec.js';
import { projectTranscriptMessages } from './sessionTranscript.js';

function marker(id: string): SessionMessage {
  return { id, role: 'system', content: '', requestDeclaration: { version: 1,
    target: { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', replayBinding: 'a'.repeat(64) }, tools: [] } };
}
const checkpoint = (index: number): SessionMessage => ({ role: 'user', content: `[Context Checkpoint]\ns${index}` });

it('preserves the original kept-tail interpretation when the suffix crosses the declaration prefix', () => {
  const retention = new TranscriptRetention();
  let expected: SessionMessage[] = [];
  const keeps = [0, 1, 2, 4, 20, undefined, 0.2, 1.5, Infinity, 5];
  for (let index = 0; index < 150; index++) {
    const message: SessionMessage = index % 3 === 0 ? marker(`m${index}`) : { role: index % 2 ? 'assistant' : 'user', content: String(index) };
    retention.append(message); expected.push(message);
    if (index % 2) {
      const kept = keeps[Math.floor(index / 2) % keeps.length];
      const tail = kept && kept > 0 ? expected.slice(-kept) : [];
      const cut = expected.length - tail.length;
      expected = [...expected.slice(0, cut).filter(message => message.requestDeclaration), checkpoint(index), ...tail];
      retention.compact(checkpoint(index), kept);
    }
    expect(retention.messages()).toEqual(expected);
  }
});

it('projects large repeated compactions without revisiting the declaration prefix', () => {
  const markerCount = 4000; const receiptCount = 6000;
  const events: TranscriptEvent[] = Array.from({ length: markerCount }, (_, index) => createMessageTranscriptEvent({ ...marker(`m${index}`), timestamp: 't' }));
  events.push({ type: 'message', id: 'tail', role: 'user', content: 'tail', timestamp: 't' });
  for (let index = 0; index < receiptCount; index++) events.push({ type: 'compaction', id: `c${index}`, summary: String(index),
    // Move most of the prefix behind a checkpoint, then move it back again.
    keptMessages: index % 2 ? markerCount + 1 : 1, timestamp: 't' });
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator)!;
  const originalIterator = descriptor.value;
  const originalSlice = Array.prototype.slice;
  let visited = 0;
  const count = (value: unknown) => { if ((value as SessionMessage)?.requestDeclaration && ++visited > events.length * 4) throw new Error('Declaration history was repeatedly copied.'); };
  const sliced = vi.spyOn(Array.prototype, 'slice').mockImplementation(function (this: unknown[], ...args) {
    const result = originalSlice.apply(this, args);
    for (const value of originalIterator.call(result)) count(value);
    return result;
  });
  Object.defineProperty(Array.prototype, Symbol.iterator, { ...descriptor, value: function* () {
    for (const value of originalIterator.call(this)) { count(value); yield value; }
  } });
  let result: SessionMessage[];
  try { result = projectTranscriptMessages(events); }
  finally { Object.defineProperty(Array.prototype, Symbol.iterator, descriptor); sliced.mockRestore(); }
  expect(visited).toBeLessThanOrEqual(events.length * 4);
  expect(result!.filter(message => message.requestDeclaration).map(message => message.id)).toEqual(Array.from({ length: markerCount }, (_, index) => `m${index}`));
  expect(result!.at(-1)?.content).toBe('tail');
});

it('cancels expansion inside a large retained declaration range', () => {
  const retention = new TranscriptRetention();
  for (let index = 0; index < 1000; index++) retention.append(marker(`m${index}`));
  retention.compact(checkpoint(1), 0);
  const check = vi.fn(() => { if (check.mock.calls.length === 3) throw new Error('cancelled'); });
  expect(() => retention.messages({ throwIfAborted: check } as unknown as AbortSignal)).toThrow('cancelled');
  expect(check).toHaveBeenCalledTimes(3);
});

it('cancels discarding a large retained dialogue before expanding the result', () => {
  const retention = new TranscriptRetention();
  retention.append(marker('initial'));
  for (let index = 0; index < 1000; index++) retention.append({ role: 'user', content: String(index) });
  const check = vi.fn(() => { if (check.mock.calls.length === 3) throw new Error('cancelled'); });
  expect(() => retention.compact(checkpoint(1), 0, { throwIfAborted: check } as unknown as AbortSignal)).toThrow('cancelled');
  expect(check).toHaveBeenCalledTimes(3);
  expect(retention.messages().filter(message => message.requestDeclaration).map(message => message.id)).toEqual(['initial']);
  retention.compact(checkpoint(2), 0);
  expect(retention.messages()).toEqual([marker('initial'), checkpoint(2)]);
});
