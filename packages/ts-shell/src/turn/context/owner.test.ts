import { afterEach, expect, it, vi } from 'vitest';
import type { RequestContextOwner } from '../../core/agent/context.js';
import type { PreparedTurnContext, StepRequest } from './contract.js';
import { createStepFunction } from '../step.js';
import { createTurnRequest } from '../request.js';
import { EventChannel } from '../stream.js';
import { resetSessionUsage } from '../../observability/usageTelemetry.js';
import { bindTurnContext } from './owner.js';

const sessionId = 'context-owner-regression';
afterEach(() => resetSessionUsage(sessionId));
const tool = (name: string) => ({ type: 'function' as const, function: { name, parameters: { type: 'object' } } });
const response = () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
  { headers: { 'content-type': 'application/json' } });
function request(overrides: Partial<StepRequest> = {}): StepRequest {
  return { provider: { provider: 'fixture', model: 'model', headers: {}, baseUrl: 'https://fixture.test/v1' },
    sessionId, workspaceRoot: process.cwd(), systemPrompt: '', tools: [], ...overrides };
}
const owner = (isCurrent: () => boolean): RequestContextOwner => ({ eligible: true, isCurrent, accept: () => false });

it.each(['ordinary', 'candidate'] as const)('refuses %s history retirement instead of refreshing into an unfenced request', async kind => {
  let current = true;
  const send = vi.fn(async () => response());
  const refresh = vi.fn();
  const step = createStepFunction(request({ fetchImpl: send }));
  const stream = createTurnRequest({ step, sessionId, maxSteps: 3,
    prepareContext: async prepared => {
      const selected = kind === 'candidate' ? await prepared.prepare([{ role: 'user', content: 'candidate' }]) : prepared;
      const captured = { ...selected, refresh: async (signal?: AbortSignal) => { refresh(); return selected.refresh(signal); } };
      return captured;
    },
    onPreparedContext: () => { current = false; },
  }, { stepCount: 1 }, new EventChannel());
  const result = await stream([{ role: 'user', content: 'captured history' }], undefined,
    { requestId: 'owner-request', context: owner(() => current) });
  expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
  expect(send).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
});

it('refreshes changed declarations while retaining the same current history fence', async () => {
  let tools = [tool('read')]; const send = vi.fn(async (_url: unknown, _init?: RequestInit) => response());
  const stream = createTurnRequest({ step: createStepFunction(request({ toolSnapshot: () => tools, fetchImpl: send })),
    sessionId, maxSteps: 3, onPreparedContext: () => { tools = [tool('write')]; },
  }, { stepCount: 1 }, new EventChannel());
  const result = await stream([{ role: 'user', content: 'captured history' }], undefined,
    { requestId: 'owner-current', context: owner(() => true) });
  expect(result.stopReason).toBe('stop'); expect(send).toHaveBeenCalledOnce();
  expect(JSON.parse(String(send.mock.calls[0]![1]?.body)).tools[0].function.name).toBe('write');
});

it('keeps the live fence on a native retry after its preparation callback has already run', async () => {
  let current = true;
  const prepareContext = vi.fn(async () => undefined);
  const send = vi.fn(async () => {
    current = false;
    return new Response('unavailable', { status: 503 });
  });
  const step = createStepFunction(request({ fetchImpl: send, retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 } }));
  const result = await step([{ role: 'user', content: 'captured history' }], undefined, {},
    { allowTools: true, contextOwner: owner(() => current), prepareContext });
  expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
  expect(send).toHaveBeenCalledOnce(); expect(prepareContext).toHaveBeenCalledOnce();
});

it('keeps the same history fence when automatic effort fallback would prepare another native request', async () => {
  let current = true;
  const prepareContext = vi.fn(async () => undefined);
  const send = vi.fn(async () => {
    current = false;
    return new Response(JSON.stringify({ error: 'reasoning_effort unsupported' }),
      { status: 400, headers: { 'content-type': 'application/json' } });
  });
  const step = createStepFunction(request({ fetchImpl: send, thinkingEffort: 'medium', thinkingEffortExplicit: false }));
  const result = await step([{ role: 'user', content: 'captured history' }], undefined, {},
    { allowTools: true, contextOwner: owner(() => current), prepareContext });
  expect(result).toMatchObject({ stopReason: 'error', retriesExhausted: true });
  expect(send).toHaveBeenCalledOnce(); expect(prepareContext).toHaveBeenCalledOnce();
});

it('does not return a current context when its live owner retires while refreshing declarations', async () => {
  let current = true;
  let captured: PreparedTurnContext | undefined;
  await createStepFunction(request({ fetchImpl: async () => response() }))([{ role: 'user', content: 'history' }], undefined, {},
    { allowTools: true, prepareContext: async value => { captured = value; return undefined; } });
  const prepared = captured!;
  const refresh = vi.fn(async (signal?: AbortSignal) => { current = false; return prepared.refresh(signal); });
  const bound = bindTurnContext({ ...prepared, refresh }, owner(() => current));
  await expect(bound.refresh()).rejects.toThrow('Request history changed');
  expect(refresh).toHaveBeenCalledOnce(); expect(bound.isCurrent()).toBe(false);
});
