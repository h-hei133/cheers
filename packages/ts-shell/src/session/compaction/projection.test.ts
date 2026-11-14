import { expect, it, vi } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import { clampToolResults } from './projection.js';

it('retains the exact accepted capture when asynchronous clipping admission is not monotone', async () => {
  const messages: AgentMessage[] = [
    { role: 'assistant', content: '', tool_calls: [{ id: 'read', type: 'function', function: { name: 'read', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'read', content: 'HEAD' + 'x'.repeat(10_000) + 'TAIL' },
  ];
  const before = JSON.stringify(messages);
  const accepted: Array<{ messages: readonly AgentMessage[]; send: ReturnType<typeof vi.fn> }> = [];
  let calls = 0;
  const result = await clampToolResults(messages, 200, async candidate => {
    await Promise.resolve();
    if (++calls % 2 === 0) return undefined;
    const capture = { messages: candidate, send: vi.fn() };
    accepted.push(capture);
    return capture;
  });
  expect(calls).toBeGreaterThan(2);
  expect(result).toBe(accepted.at(-1));
  expect(result!.messages[0]).toBe(messages[0]);
  expect(result!.messages[1]!.content).toMatch(/^HEAD[\s\S]*truncated for summary[\s\S]*TAIL$/);
  expect(JSON.stringify(messages)).toBe(before);
});

it('does not accept a clipped capture settled after cancellation', async () => {
  const controller = new AbortController();
  const send = vi.fn();
  await expect(clampToolResults([{ role: 'tool', tool_call_id: 'read', content: 'x'.repeat(1000) }], 100,
    async messages => { controller.abort(); return { messages, send }; }, controller.signal))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(send).not.toHaveBeenCalled();
});
