import { expect, it } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import { estimateTokens } from '../context.js';
import { SummaryAdmissionError, type PreparedSummaryStep } from './contract.js';
import { legalUnits, MAX_SEGMENT_MESSAGES, scheduleSegments } from './schedule.js';

function toolGroup(results: readonly string[]): AgentMessage[] {
  return [
    { role: 'assistant', content: '', tool_calls: results.map((_, index) => ({ id: `read-${index}`, type: 'function' as const,
      function: { name: 'read', arguments: JSON.stringify({ path: `src/${index}.ts` }) } })) },
    ...results.map((content, index) => ({ role: 'tool' as const, tool_call_id: `read-${index}`, content })),
  ];
}

it('clamps a 38KB result within the segment budget while preserving its call and both ends', async () => {
  const content = 'BEGIN\n' + 'x'.repeat(38 * 1024) + '\nEND';
  const messages = toolGroup([content]);
  const before = JSON.stringify(messages);
  const segments = (await scheduleSegments({ messages, maxTokens: 8192 })).map(segment => segment.messages);
  expect(segments).toHaveLength(1);
  expect(estimateTokens(segments[0]!)).toBeLessThanOrEqual(8192);
  expect(legalUnits(segments[0]!)).toHaveLength(1);
  expect(segments[0]![0]).toBe(messages[0]);
  const result = segments[0]![1]!;
  expect(result.tool_call_id).toBe('read-0');
  expect(result.content).toMatch(/^BEGIN\n/);
  expect(result.content).toContain('[... truncated for summary ...]');
  expect(result.content).toMatch(/\nEND$/);
  expect(JSON.stringify(messages)).toBe(before);
});

it('shares the text budget across multiple results without dropping any tool relationship', async () => {
  const messages = toolGroup(['FIRST' + 'a'.repeat(38 * 1024) + 'LAST', 'SECOND' + 'b'.repeat(38 * 1024) + 'TAIL', 'small result']);
  const segments = (await scheduleSegments({ messages, maxTokens: 1000 })).map(segment => segment.messages);
  expect(segments).toHaveLength(1);
  const projected = segments[0]!;
  expect(projected.map(message => message.tool_call_id).filter(Boolean)).toEqual(['read-0', 'read-1', 'read-2']);
  expect(estimateTokens(projected)).toBeLessThanOrEqual(1000);
  expect(projected[1]!.content).toMatch(/^FIRST/);
  expect(projected[1]!.content).toMatch(/LAST$/);
  expect(projected[2]!.content).toMatch(/^SECOND/);
  expect(projected[2]!.content).toMatch(/TAIL$/);
  expect(projected[1]!.content).toContain('[... truncated for summary ...]');
  expect(projected[2]!.content).toContain('[... truncated for summary ...]');
  expect(projected[3]).toBe(messages[3]);
  expect(legalUnits(projected)).toHaveLength(1);
});

it('preserves Unicode at both clipping boundaries and leaves frozen input untouched', async () => {
  const content = '😀'.repeat(2000);
  const messages = toolGroup([content]);
  for (const message of messages) Object.freeze(message);
  Object.freeze(messages);
  const projected = (await scheduleSegments({ messages, maxTokens: 101 }))[0]!.messages;
  const text = projected[1]!.content as string;
  const ends = text.split('\n\n[... truncated for summary ...]\n\n');
  expect(ends).toHaveLength(2);
  for (const end of ends) expect(end).toMatch(/^(?:😀)+$/u);
  expect(estimateTokens(projected)).toBeLessThanOrEqual(101);
  expect(messages[1]!.content).toBe(content);
});

it('clamps text blocks without changing image blocks or saved multimodal content', async () => {
  const messages = toolGroup(['']);
  const image = { type: 'image' as const, data: 'fixture', mimeType: 'image/png' };
  messages[1] = { ...messages[1]!, content: [
    { type: 'text', text: 'HEAD' + 'a'.repeat(20_000) + 'TAIL' }, image,
    { type: 'text', text: 'NEXT' + 'b'.repeat(20_000) + 'END' },
  ] };
  const before = JSON.stringify(messages);
  const projected = (await scheduleSegments({ messages, maxTokens: 2500 }))[0]!.messages;
  expect(estimateTokens(projected)).toBeLessThanOrEqual(2500);
  expect(projected[1]!.content).toEqual([
    { type: 'text', text: expect.stringMatching(/^HEAD[\s\S]*truncated for summary[\s\S]*TAIL$/) }, image,
    { type: 'text', text: expect.stringMatching(/^NEXT[\s\S]*truncated for summary[\s\S]*END$/) },
  ]);
  expect((projected[1]!.content as readonly unknown[])[1]).toBe(image);
  expect(JSON.stringify(messages)).toBe(before);
});

it('rechecks a stricter complete-request preflight after clipping result prose', async () => {
  const messages = toolGroup(['HEAD' + 'x'.repeat(5000) + 'TAIL']);
  let refused = 0;
  let accepted = 0;
  const segments = await scheduleSegments({ messages, maxTokens: 2000, validate: projected => {
    if (estimateTokens(projected) + 200 > 450) {
      refused++;
      throw new SummaryAdmissionError('Summary request refused: complete request exceeds the input budget.');
    }
    accepted++;
  } });
  expect(refused).toBeGreaterThan(0);
  expect(accepted).toBeGreaterThan(0);
  expect(estimateTokens(segments[0]!.messages) + 200).toBeLessThanOrEqual(450);
  expect(segments[0]!.messages[1]!.content).toMatch(/^HEAD[\s\S]*truncated for summary[\s\S]*TAIL$/);
});

it('propagates a non-admission preflight failure without disguising it as a budget refusal', async () => {
  const failure = new Error('preflight implementation failed');
  let caught: unknown;
  try { await scheduleSegments({ messages: toolGroup(['result']), validate: () => { throw failure; } }); }
  catch (error) { caught = error; }
  expect(caught).toBe(failure);
});

it('propagates a non-admission failure raised while evaluating the clipped projection', async () => {
  const failure = new TypeError('invalid provider shape');
  let caught: unknown;
  try { await scheduleSegments({ messages: toolGroup(['x'.repeat(20_000)]), maxTokens: 100, validate: () => { throw failure; } }); }
  catch (error) { caught = error; }
  expect(caught).toBe(failure);
});

it('refuses when fixed call arguments cannot fit even after result prose is reduced', async () => {
  const messages = toolGroup(['HEAD' + 'x'.repeat(5000) + 'TAIL']);
  messages[0] = { ...messages[0]!, tool_calls: [{ id: 'read-0', type: 'function',
    function: { name: 'read', arguments: JSON.stringify({ path: 'p'.repeat(2000) }) } }] };
  const before = JSON.stringify(messages);
  await expect(scheduleSegments({ messages, maxTokens: 100 })).rejects.toThrow(SummaryAdmissionError);
  expect(JSON.stringify(messages)).toBe(before);
});

it('refuses when the loss marker and both result ends cannot fit', async () => {
  const fixedTokens = estimateTokens(toolGroup(['']));
  await expect(scheduleSegments({ messages: toolGroup(['x'.repeat(5000)]), maxTokens: fixedTokens + 1 })).rejects.toThrow(SummaryAdmissionError);
});

it('refuses when fixed request scaffolding alone exceeds the provider budget', async () => {
  const messages = toolGroup(['x'.repeat(5000)]);
  const before = JSON.stringify(messages);
  await expect(scheduleSegments({ messages, maxTokens: 1000, validate: projected => {
    if (estimateTokens(projected) + 500 > 450) throw new SummaryAdmissionError('Summary request refused: fixed overhead exceeds the input budget.');
  } })).rejects.toThrow(SummaryAdmissionError);
  expect(JSON.stringify(messages)).toBe(before);
});

it('preserves the message-count refusal for an indivisible call group', async () => {
  await expect(scheduleSegments({ messages: toolGroup(Array.from({ length: MAX_SEGMENT_MESSAGES }, () => 'x'.repeat(1000))) }))
    .rejects.toThrow(SummaryAdmissionError);
});

it('retains fitting result groups verbatim and never clips ordinary summary merge prose', async () => {
  const messages = toolGroup(['small result']);
  const segments = await scheduleSegments({ messages, maxTokens: 100 });
  expect(segments[0]!.messages).toEqual(messages);
  expect(segments[0]!.messages[1]).toBe(messages[1]);
  await expect(scheduleSegments({ messages: [{ role: 'user', content: 'x'.repeat(10_000) }], maxTokens: 100 }))
    .rejects.toThrow(SummaryAdmissionError);
});

it('validates all source relationships before clipping or admitting any group', async () => {
  await expect(scheduleSegments({ messages: [
    ...toolGroup(['x'.repeat(20_000)]), { role: 'tool', tool_call_id: 'missing', content: 'unpaired' },
  ], maxTokens: 100 })).rejects.toThrow('a tool result has no call in its segment');
});

it('uses converted tokens to admit large raw history and refuse small expanded history', async () => {
  const compact: PreparedSummaryStep = { identity: 'compact', tokens: 1, send: async () => 'summary' };
  const expanded: PreparedSummaryStep = { identity: 'expanded', tokens: 101, send: async () => 'summary' };
  const large: AgentMessage[] = [{ role: 'user', content: 'x'.repeat(10_000) }];
  const segments = await scheduleSegments({ messages: large, maxTokens: 100, prepare: async () => compact });
  expect(segments[0]!.messages).toEqual(large);
  expect(segments[0]!.prepared).toBe(compact);
  await expect(scheduleSegments({ messages: [{ role: 'user', content: 'small' }], maxTokens: 100,
    prepare: async () => expanded })).rejects.toThrow(SummaryAdmissionError);
});

it('prepares the next segment with its actual index and keeps earlier captures', async () => {
  const prepared: PreparedSummaryStep[] = [];
  const indexes: number[] = [];
  const messages: AgentMessage[] = [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'second' }];
  const segments = await scheduleSegments({ messages, maxTokens: 10, prepare: async (candidate, index) => {
    indexes.push(index);
    const step = { identity: `${index}:${candidate.length}`, tokens: candidate.length * 10, send: async () => 'summary' };
    prepared.push(step);
    return step;
  } });
  expect(indexes).toEqual([0, 0, 1]);
  expect(segments.map(segment => segment.messages)).toEqual([[messages[0]], [messages[1]]]);
  expect(segments[0]!.prepared).toBe(prepared[0]);
  expect(segments[1]!.prepared).toBe(prepared[2]);
});

it('discards a late preparation result after cancellation', async () => {
  const controller = new AbortController();
  await expect(scheduleSegments({ messages: [{ role: 'user', content: 'history' }], signal: controller.signal,
    prepare: async () => {
      await Promise.resolve();
      controller.abort();
      return { identity: 'late', tokens: 1, send: async () => 'must not send' };
    } })).rejects.toMatchObject({ name: 'AbortError' });
});
