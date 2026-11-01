import { expect, it } from 'vitest';
import type { QueryEvent } from '../query/runtime/events.js';
import { ShellSessionRuntime } from './sessionRuntime.js';

it.each([false, true])('keeps cancellation delivery and its original error after a display observer throws (entered=%s)', async entered => {
  const original = new Error('original interruption');
  const recorded: string[] = [], observed: string[] = [], settled: string[] = [];
  const cancellationState: unknown[] = [];
  const runtime = new ShellSessionRuntime({
    sessionManager: { persistUserPromptBarrier() {}, markTurnActive() {},
      appendQueryEvent(_id: string, event: QueryEvent) { recorded.push(event.type); },
      saveInterrupted(_id: string, boundary: string) { settled.push(boundary); } } as never,
    renderer: { renderLine() {}, renderChunk() {} } as never,
    runPrompt: async function* () {
      if (entered) yield { type: 'message.delta', role: 'coder', delta: 'partial' } as const;
      runtime.cancelCurrentRun(); throw original;
    },
  });
  runtime.observeEvents(event => { if (event.type === 'lifecycle.cancelled') throw new Error('display observer failed'); }, { renders: false });
  runtime.observeEvents(event => {
    observed.push(event.type);
    if (event.type === 'lifecycle.cancelled') {
      cancellationState.push({ settled: [...settled], state: runtime.getState(), controllerReleased: runtime.getCurrentRunController() === null });
    }
  });
  await expect(runtime.executePrompt('observers', 'request')).rejects.toBe(original);
  await expect(runtime.waitForIdle()).rejects.toBe(original);
  expect(recorded).toEqual(['lifecycle.cancelled']);
  expect(observed).toEqual(entered ? ['message.delta', 'lifecycle.cancelled'] : ['lifecycle.cancelled']);
  expect(cancellationState).toEqual([{ settled: [entered ? 'turn' : 'prompt'], state: 'interrupted', controllerReleased: true }]);
});

it.each(['completed', 'cancelled'] as const)('isolates rejected observer promises without awaiting display work (%s)', async outcome => {
  const observed: string[] = [], recorded: string[] = [], settled: string[] = [];
  const original = new Error('original cancellation');
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const runtime = new ShellSessionRuntime({
    sessionManager: { persistUserPromptBarrier() {}, markTurnActive() {}, saveCompleted() { settled.push('completed'); },
      saveInterrupted() { settled.push('interrupted'); }, appendQueryEvent(_id: string, event: QueryEvent) { recorded.push(event.type); } } as never,
    renderer: { renderLine() {}, renderChunk() {} } as never,
    runPrompt: async function* () {
      if (outcome === 'cancelled') { runtime.cancelCurrentRun(); throw original; }
      yield { type: 'query.completed', result: { status: 'completed', terminalReason: 'completed', terminalClassification: 'success',
        transcript: [], sharedContext: { sessionId: 'observers', initialPrompt: 'request', notes: [], handoffs: [] }, finalOutput: 'done' } } as const;
    },
  });
  // TypeScript permits async callbacks where a void observer is expected. Their
  // rejected work must be handled without delaying the durable lifecycle.
  runtime.observeEvents(async () => { throw new Error('asynchronous display failure'); }, { renders: false });
  runtime.observeEvents(() => pending, { renders: false });
  runtime.observeEvents(event => { observed.push(event.type); });
  try {
    if (outcome === 'cancelled') await expect(runtime.executePrompt('observers', 'request')).rejects.toBe(original);
    else await expect(runtime.executePrompt('observers', 'request')).resolves.toBe('done');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(observed).toEqual([outcome === 'cancelled' ? 'lifecycle.cancelled' : 'query.completed']);
    expect(recorded).toEqual(observed); expect(settled).toEqual([outcome === 'cancelled' ? 'interrupted' : 'completed']);
  } finally { release(); }
}, 1_000);
