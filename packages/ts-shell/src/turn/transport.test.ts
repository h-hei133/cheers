import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { runAgentLoop } from '../core/agent/loop.js';
import { resetSessionUsage } from '../observability/usageTelemetry.js';
import { createProviderFetchFromEnv } from '../provider/request/fetch.js';
import { createStepFunction } from './step.js';

const request = {
  provider: { headers: {}, baseUrl: 'https://provider.test/v1', model: 'fixture' },
  workspaceRoot: process.cwd(), sessionId: 'transport-failure', systemPrompt: 'Be brief.', tools: [],
};
const canary = 'PRIVATE_TRANSPORT_CANARY';

function transportError(code?: string, message = 'fetch failed'): Error {
  return new TypeError(message + ' ' + canary, {
    cause: Object.assign(new Error(canary + ' https://private.invalid/'), { code }),
  });
}

describe('transport failure projection', () => {
  it.each([
    ['UND_ERR_CONNECT_TIMEOUT', 'provider_timeout', 'connection timed out'],
    ['UND_ERR_HEADERS_TIMEOUT', 'provider_timeout', 'timed out waiting for response headers'],
    ['UND_ERR_BODY_TIMEOUT', 'provider_timeout', 'timed out waiting for response body'],
    ['ECONNRESET', 'provider_network', 'connection closed'],
    [canary, undefined, 'request failed'],
  ] as const)('reports only safe transport evidence for %s', async (code, failureClass, message) => {
    const step = createStepFunction({ ...request, fetchImpl: async () => { throw transportError(code); } });
    const result = await step([], undefined, {}, { allowTools: true });
    expect(result).toMatchObject({ stopReason: 'error', text: '', toolCalls: [],
      errorMessage: 'Network error: ' + message + '. Details withheld.' });
    expect(result.failureClass).toBe(failureClass);
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(JSON.stringify(result)).not.toContain('private.invalid');
  });

  it('bounds unknown causes without exposing strings or invoking cause getters', async () => {
    const cycle = transportError();
    cycle.cause = cycle;
    let reads = 0;
    const accessor = Object.defineProperty(new Error(canary), 'cause', { get() { reads++; throw new Error(canary); } });
    for (const error of [null, canary, cycle, accessor]) {
      const step = createStepFunction({ ...request, fetchImpl: async () => { throw error; } });
      const result = await step([], undefined, {}, { allowTools: true });
      expect(result).toMatchObject({ stopReason: 'error', toolCalls: [],
        errorMessage: 'Network error: request failed. Details withheld.' });
      expect(result.failureClass).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain(canary);
    }
    expect(reads).toBe(0);
  });

  it.each([
    [503, 'UND_ERR_HEADERS_TIMEOUT', 'provider_timeout'],
    [429, undefined, undefined],
  ] as const)('replaces a prior HTTP %s class with the final attempt evidence', async (status, code, failureClass) => {
    let calls = 0;
    const step = createStepFunction({ ...request,
      retry: { maxRetries: 1, baseDelayMs: 0, maxDelayMs: 0 },
      fetchImpl: async () => {
        if (++calls === 1) return new Response(canary, { status });
        throw transportError(code);
      },
    });
    const result = await step([], undefined, {}, { allowTools: false });
    expect(calls).toBe(2);
    expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
    expect(result.failureClass).toBe(failureClass);
    expect(result.errorMessage).not.toContain('HTTP');
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it.each([0, 1])('preserves retry ownership with %s provider retries', async providerRetries => {
    let calls = 0;
    const step = createStepFunction({ ...request,
      retry: { maxRetries: providerRetries, baseDelayMs: 0, maxDelayMs: 0 },
      fetchImpl: async () => {
        if (++calls > 4) return Response.json({ choices: [{ message: { content: 'finite guard' }, finish_reason: 'stop' }] });
        throw transportError('UND_ERR_HEADERS_TIMEOUT');
      },
    });
    const produced = await runAgentLoop([], [], {
      retry: { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 },
      streamStep: (messages, signal) => step(messages, signal, {}, { allowTools: false }),
    }, () => {}, undefined);
    expect(calls).toBe(providerRetries === 0 ? 3 : 2);
    expect(produced.at(-1)).toMatchObject({ stopReason: 'error', failureClass: 'provider_timeout' });
    expect(JSON.stringify(produced)).not.toContain(canary);
  });

  it.each([
    ['insufficient_quota', 0], ['insufficient_quota', 2],
    ['content_filter', 0], ['content_filter', 2],
  ] as const)('preserves the private %s retry exclusion with %s provider retries', async (reason, providerRetries) => {
    let calls = 0;
    const attempts: Array<{ dispatched: boolean; settled: boolean; confirmedUnsent: boolean }> = [];
    const step = createStepFunction({ ...request,
      retry: { maxRetries: providerRetries, baseDelayMs: 0, maxDelayMs: 0 },
      requestPolicy: { reserve() {
        const attempt = { dispatched: false, settled: false, confirmedUnsent: false };
        attempts.push(attempt);
        return { id: `private-refusal-${attempts.length}`,
          dispatch() { attempt.dispatched = true; },
          settle() { attempt.settled = true; },
          confirmUnsent() { attempt.confirmedUnsent = true; } };
      } },
      fetchImpl: async () => {
        if (++calls > 1) return Response.json({ choices: [{ message: { content: 'finite guard' }, finish_reason: 'stop' }] });
        throw transportError(undefined, reason);
      } });
    const produced = await runAgentLoop([], [], {
      retry: { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 },
      streamStep: (messages, signal) => step(messages, signal, {}, { allowTools: false }),
    }, () => {}, undefined);
    expect(calls).toBe(1);
    expect(produced.at(-1)).toMatchObject({ stopReason: 'error' });
    // A dispatched request with no response keeps unknown accounting. Neither
    // suppressing its retry nor redacting its error can release or settle it.
    expect(attempts).toEqual([{ dispatched: true, settled: false, confirmedUnsent: false }]);
    expect(JSON.stringify(produced)).not.toContain(canary);
  });

  it('gives caller cancellation precedence over a simultaneous native timeout', async () => {
    const controller = new AbortController();
    const step = createStepFunction({ ...request, fetchImpl: async () => {
      controller.abort();
      throw transportError('UND_ERR_HEADERS_TIMEOUT');
    } });
    const result = await step([], controller.signal, {}, { allowTools: true });
    expect(result).toMatchObject({ stopReason: 'aborted', text: '', toolCalls: [], errorMessage: 'Operation aborted' });
    expect(result.failureClass).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it('retains the native timeout through the Anthropic reader wrapper', async () => {
    const step = createStepFunction({ ...request,
      provider: { ...request.provider, endpoint: 'anthropic-messages' },
      fetchImpl: async () => new Response(new ReadableStream({ start(stream) {
        stream.error(transportError('UND_ERR_BODY_TIMEOUT', 'terminated'));
      } }), { headers: { 'content-type': 'text/event-stream' } }),
    });
    const result = await step([], undefined, {}, { allowTools: false });
    expect(result).toMatchObject({ stopReason: 'error', toolCalls: [], failureClass: 'provider_timeout',
      errorMessage: 'Network error: timed out waiting for response body. Details withheld.', retriesExhausted: true });
    expect(JSON.stringify(result)).not.toContain(canary);
  });

  it.each([false, true])('does not replay an accepted body timeout with visible output %s', async visible => {
    let calls = 0, executed = 0;
    const seen: string[] = [];
    let observed: Awaited<ReturnType<ReturnType<typeof createStepFunction>>> | undefined;
    const step = createStepFunction({ ...request, retry: { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 },
      fetchImpl: async () => {
        if (++calls > 1) return Response.json({ choices: [{ message: { content: 'finite guard' }, finish_reason: 'stop' }] });
        let first = true;
        return new Response(new ReadableStream<Uint8Array>({ pull(stream) {
          if (!first) { stream.error(transportError('UND_ERR_BODY_TIMEOUT', 'terminated')); return; }
          first = false;
          const delta = { ...(visible ? { content: 'Partial answer.', reasoning_content: 'Public thought.' } : {}),
            tool_calls: [{ index: 0, id: 'untrusted', type: 'function', function: { name: 'write', arguments: '{}' } }] };
          stream.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n'));
        } }), { headers: { 'content-type': 'text/event-stream' } });
      },
    });
    const produced = await runAgentLoop([], [], {
      retry: { maxRetries: 2, baseDelayMs: 0, maxDelayMs: 0 },
      streamStep: async (messages, signal) => {
        observed = await step(messages, signal, { onText: text => { seen.push(text); } }, { allowTools: true });
        return observed;
      },
      tools: [{ name: 'write', execute: async () => { executed++; return { output: 'must not execute', isError: false }; } }],
    }, () => {}, undefined);
    expect(calls).toBe(1);
    expect(executed).toBe(0);
    expect(seen).toEqual(visible ? ['Partial answer.'] : []);
    expect(observed).toMatchObject({ text: visible ? 'Partial answer.' : '', toolCalls: [], stopReason: 'error',
      failureClass: 'provider_timeout', retriesExhausted: true,
      errorMessage: 'Network error: timed out waiting for response body. Details withheld.' });
    expect(observed?.reasoning?.text).toBe(visible ? 'Public thought.' : undefined);
    expect(observed?.reasoning?.signature).toBeUndefined();
    expect(observed?.origin?.replayBinding).toBeUndefined();
    expect(produced.at(-1)?.stopReason).toBe('error');
    expect(JSON.stringify(produced)).not.toContain(canary);
  });

  it.each(['headers', 'body'] as const)('projects an actual native %s deadline through the step', async phase => {
    let calls = 0;
    const server = http.createServer((_request, response) => {
      calls++;
      if (phase === 'body') {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.write('data: {"choices":[{"delta":{"content":"Partial native answer."}}]}\n\n');
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const sessionId = 'native-timeout-' + phase;
    try {
      const step = createStepFunction({ ...request, sessionId,
        provider: { ...request.provider, baseUrl: 'http://127.0.0.1:' + (server.address() as AddressInfo).port },
        fetchImpl: createProviderFetchFromEnv({ env: {}, timeouts: { headersTimeoutMs: 300, bodyTimeoutMs: 300 } }),
      });
      const result = await step([], undefined, {}, { allowTools: false });
      expect(calls).toBe(1);
      expect(result).toMatchObject({ stopReason: 'error', failureClass: 'provider_timeout', toolCalls: [],
        text: phase === 'body' ? 'Partial native answer.' : '',
        errorMessage: 'Network error: timed out waiting for response ' + phase + '. Details withheld.' });
      expect(result.retriesExhausted).toBe(phase === 'body' ? true : undefined);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      resetSessionUsage(sessionId);
    }
  });
});
