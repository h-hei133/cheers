import { afterEach, expect, it, vi } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import type { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { VirtualModelRegistry, type ModelRouteRequest } from '../../core/models/virtualModels.js';
import { resetSessionUsage } from '../../observability/usageTelemetry.js';
import type { CompactionPolicy } from '../../session/compaction.js';
import { runTurn } from '../session.js';
import { createStepFunction, type StepRequest, type PreparedTurnContext } from '../step.js';

const hooks = { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher;
const sessionId = 'ordinary-context-compaction';
afterEach(() => resetSessionUsage(sessionId));
async function run(input: {
  readonly rawSize?: number;
  readonly policyWindow?: number;
  readonly systemPrompt?: string;
  readonly virtualModels?: VirtualModelRegistry;
  readonly maxSteps?: number;
  readonly thinkingEffort?: StepRequest['thinkingEffort'];
  readonly thinkingEffortExplicit?: boolean;
  readonly policy?: Partial<CompactionPolicy>;
  readonly response?: (attempt: number) => Response;
  readonly prepareRequest?: Parameters<typeof runTurn>[0]['prepareRequest'];
}) {
  const raw: AgentMessage[] = Array.from({ length: 5 }, (_, index) => [
    { role: 'user' as const, content: `Question ${index}: ${'x'.repeat(input.rawSize ?? 400)}` },
    { role: 'assistant' as const, content: `Answer ${index}: ${'y'.repeat(input.rawSize ?? 400)}` },
  ]).flat();
  const bodies: string[] = [];
  const summarize = vi.fn(async () => 'Saved work.'); const publications = vi.fn();
  const request: StepRequest = { provider: { provider: 'fixture', model: 'selected', headers: {}, baseUrl: 'https://fixture.test/v1' },
    sessionId, workspaceRoot: process.cwd(), systemPrompt: input.systemPrompt ?? '',
    tools: [{ type: 'function', function: { name: 'read', parameters: { type: 'object' } } }],
    catalog: [{ id: 'fixture', baseUrl: 'https://fixture.test/v1', models: [{ id: 'selected', contextWindow: 20_000 },
      { id: 'small', contextWindow: 1800 }, { id: 'large', contextWindow: 20_000 }] }],
    maxOutputTokens: 10, reserveTokens: 0, virtualModels: input.virtualModels,
    thinkingEffort: input.thinkingEffort, thinkingEffortExplicit: input.thinkingEffortExplicit,
    fetchImpl: async (_url, init) => {
      bodies.push(String(init?.body));
      return input.response?.(bodies.length) ?? new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }),
        { headers: { 'content-type': 'application/json' } });
    },
  };
  const run = runTurn({ sessionId, workspaceRoot: process.cwd(), prompt: 'Continue.', history: raw,
    signal: new AbortController().signal, onMessage: () => {}, hooks, maxSteps: input.maxSteps ?? 3, retry: { enabled: false },
    tools: new Map([['read', { name: 'read', description: 'read', parameters: { type: 'object' }, execute: async () => ({ success: true, output: 'ok' }) }]]),
    step: createStepFunction(request),
    ...(input.prepareRequest ? { prepareRequest: input.prepareRequest } : {}),
    compaction: { policy: { contextWindow: input.policyWindow ?? 1800, reserveTokens: 0, outputTokens: 10, keepRecentTokens: 10,
      ...input.policy },
      summarize, onCompact: publications },
  });
  for await (const _event of run.events) { /* Actual ordinary request without a converter. */ }
  return { bodies, summarize, publications };
}

it('does not compact plain raw history that the actual routed model can already admit', async () => {
  const registry = new VirtualModelRegistry(); const route = vi.fn(() => ({ provider: 'fixture', modelId: 'large' }));
  registry.register({ provider: 'fixture', id: 'selected', name: 'Selection', route });
  const result = await run({ rawSize: 800, virtualModels: registry });
  expect(result.summarize).not.toHaveBeenCalled(); expect(result.publications).not.toHaveBeenCalled();
  expect(result.bodies).toHaveLength(1); expect(JSON.parse(result.bodies[0]!).model).toBe('large');
  expect(result.bodies[0]).toContain('Question 0'); expect(route).toHaveBeenCalledOnce();
});

it('uses the complete ordinary request overhead and routed window before publishing its candidate', async () => {
  const registry = new VirtualModelRegistry(); const route = vi.fn(() => ({ provider: 'fixture', modelId: 'small' }));
  registry.register({ provider: 'fixture', id: 'selected', name: 'Selection', route });
  const result = await run({ rawSize: 250, policyWindow: 20_000, systemPrompt: 'System '.repeat(420), virtualModels: registry });
  expect(result.summarize).toHaveBeenCalledOnce(); expect(result.publications).toHaveBeenCalledOnce();
  expect(result.bodies).toHaveLength(1); expect(result.bodies[0]).toContain('[Context Checkpoint]');
  expect(JSON.parse(result.bodies[0]!).model).toBe('small'); expect(route).toHaveBeenCalledTimes(1);
});

it('recovers an ordinary provider overflow with the next closing contract and its captured route', async () => {
  const registry = new VirtualModelRegistry(); const route = vi.fn(() => ({ provider: 'fixture', modelId: 'large' }));
  registry.register({ provider: 'fixture', id: 'selected', name: 'Selection', route });
  const result = await run({ rawSize: 400, maxSteps: 2, policyWindow: 20_000, virtualModels: registry,
    response: attempt => attempt === 1 ? new Response('maximum context length exceeded', { status: 400 })
      : new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }),
        { headers: { 'content-type': 'application/json' } }) });
  expect(result.summarize).toHaveBeenCalledOnce(); expect(result.publications).toHaveBeenCalledOnce();
  expect(result.bodies).toHaveLength(2); const body = JSON.parse(result.bodies[1]!);
  expect(body.tools).toBeUndefined(); expect(body.messages.at(-1)?.content).toContain('You have reached the limit of steps');
  expect(body.model).toBe('large'); expect(route).toHaveBeenCalledTimes(1);
});

it('keeps temporary prepared history ineligible for ordinary durable compaction', async () => {
  const registry = new VirtualModelRegistry(); const route = vi.fn(() => ({ provider: 'fixture', modelId: 'large' }));
  registry.register({ provider: 'fixture', id: 'selected', name: 'Selection', route });
  const result = await run({ rawSize: 800, virtualModels: registry,
    prepareRequest: () => ({ messages: [{ role: 'user', content: 'Temporary request.' }] }) });
  expect(result.summarize).not.toHaveBeenCalled(); expect(result.publications).not.toHaveBeenCalled();
  expect(result.bodies).toHaveLength(1); expect(result.bodies[0]).toContain('Temporary request.');
});

it('recovers the actual small route after automatic effort fallback refuses its raw request locally', async () => {
  const registry = new VirtualModelRegistry();
  const route = vi.fn((request: ModelRouteRequest) =>
    ({ provider: 'fixture', modelId: request.reason === 'retry' ? 'small' : 'large' }));
  registry.register({ provider: 'fixture', id: 'selected', name: 'Selection', route });
  const result = await run({ rawSize: 1200, maxSteps: 2, policyWindow: 20_000, virtualModels: registry,
    thinkingEffort: 'medium', thinkingEffortExplicit: false, policy: { keepRecentTokens: undefined },
    response: attempt => attempt === 1 ? new Response('unsupported parameter: reasoning_effort', { status: 400 })
      : new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }),
        { headers: { 'content-type': 'application/json' } }) });
  expect(result.summarize).toHaveBeenCalledOnce(); expect(result.publications).toHaveBeenCalledOnce();
  expect(result.bodies).toHaveLength(2);
  const [first, recovered] = result.bodies.map(body => JSON.parse(body));
  expect(first.model).toBe('large'); expect(first.reasoning_effort).toBe('medium');
  expect(recovered.model).toBe('small'); expect(recovered.reasoning_effort).toBeUndefined();
  expect(recovered.tools).toBeUndefined(); expect(result.bodies[1]).toContain('[Context Checkpoint]');
  expect(recovered.messages.at(-1)?.content).toContain('You have reached the limit of steps');
  expect(route).toHaveBeenCalledTimes(2);
});

it('keeps ordinary candidate measurement aligned when raw ownership is attached without provider conversion', async () => {
  const source = [{ role: 'user' as const, content: 'Original.' }];
  let candidate: PreparedTurnContext | undefined;
  const step = createStepFunction({ provider: { provider: 'fixture', model: 'model', headers: {}, baseUrl: 'https://fixture.test/v1' },
    sessionId, workspaceRoot: process.cwd(), systemPrompt: '', tools: [],
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }] }),
      { headers: { 'content-type': 'application/json' } }) });
  await step(source, undefined, {}, { allowTools: true, prepareContext: async captured => {
    candidate = await (await captured.prepare([{ role: 'user', content: 'Candidate.' }])).refresh();
    return candidate;
  } });
  expect(candidate!.messageProjection.sourceMessages).toEqual([{ role: 'user', content: 'Candidate.' }]);
  expect(candidate!.messageProjection.providerMessages).toBeUndefined();
  expect(candidate!.projection.indexAligned).toBe(true); expect(candidate!.projection.sourceAligned).toBe(true);
});
