import { afterEach, expect, it, vi } from 'vitest';
import { createStepFunction } from './step.js';

const request = {
  provider: { headers: {}, baseUrl: 'https://provider.test/v1', model: 'fixture' },
  workspaceRoot: process.cwd(), sessionId: 'stream-idle-watchdog', systemPrompt: 'Be brief.', tools: [],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('fails a response body after the byte stream becomes idle', async () => {
  vi.useFakeTimers();
  vi.stubEnv('CHEERS_PROVIDER_BODY_TIMEOUT_MS', '100');
  let began!: () => void;
  const reading = new Promise<void>(resolve => { began = resolve; });
  const body = new ReadableStream<Uint8Array>({ pull: began });
  const step = createStepFunction({ ...request, fetchImpl: async () => new Response(body,
    { headers: { 'content-type': 'text/event-stream' } }) });

  const pending = step([], undefined, {}, { allowTools: false });
  await reading;
  await vi.advanceTimersByTimeAsync(100);
  await expect(pending).resolves.toMatchObject({ stopReason: 'error', failureClass: 'provider_timeout',
    errorMessage: 'Network error: timed out waiting for response body. Details withheld.' });
});

it('keeps user cancellation distinct from an idle timeout', async () => {
  vi.useFakeTimers();
  vi.stubEnv('CHEERS_PROVIDER_BODY_TIMEOUT_MS', '100');
  let began!: () => void;
  const reading = new Promise<void>(resolve => { began = resolve; });
  const body = new ReadableStream<Uint8Array>({ pull: began });
  const signal = new AbortController();
  const step = createStepFunction({ ...request, fetchImpl: async () => new Response(body,
    { headers: { 'content-type': 'text/event-stream' } }) });

  const pending = step([], signal.signal, {}, { allowTools: false });
  await reading;
  signal.abort(new Error('caller stopped request'));
  const result = await pending;
  expect(result).toMatchObject({ stopReason: 'aborted', errorMessage: 'Operation aborted' });
  expect(result).not.toHaveProperty('failureClass');
  expect(vi.getTimerCount()).toBe(0);
});

it('rearms only when the consumer requests more stream bytes', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let reads = 0;
  let began!: () => void;
  let continued!: () => void;
  const firstRead = new Promise<void>(resolve => { began = resolve; });
  const secondRead = new Promise<void>(resolve => { continued = resolve; });
  const body = new ReadableStream<Uint8Array>({
    pull(stream) {
      if (reads++ === 0) {
        began();
        stream.enqueue(new TextEncoder().encode('a'));
      } else continued();
    },
  });
  const { withBodyIdleTimeout } = await import('../provider/response/idle.js');
  const reader = withBodyIdleTimeout(body, 100, controller.signal).getReader();
  await firstRead;
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('a');
  await vi.advanceTimersByTimeAsync(200);
  let settled = false;
  let failure: unknown;
  const pending = reader.read().catch(error => { settled = true; failure = error; });
  await secondRead;
  await vi.advanceTimersByTimeAsync(99);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(failure).toMatchObject({ code: 'UND_ERR_BODY_TIMEOUT' });
  expect(settled).toBe(true);
  expect(controller.signal.aborted).toBe(false);
});
