import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { createSubagentRunner } from '../../turn/subagent.js';
import { createProviderStep, delegatedSteps, type ProviderStepHost } from './step.js';
import { declareEndpoint, endpointShape } from '../../provider/endpoints/index.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { writeGoal, readGoalEdit } from '../../planning/goal/store.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { readBoundSessionState } from '../../session/store/bound.js';

const servers: http.Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  cleanupAdvisorHarnesses();
});

async function wire(setup: ReturnType<typeof createAdvisorHarness>, status = 200) {
  const received: Record<string, unknown>[] = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(status === 200 ? JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'INDEPENDENT_ADVISOR_FINDING' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }) : JSON.stringify({ error: { message: 'sk-synthetic-HTTP-BODY-MUST-NOT-PUBLISH' } }));
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing local server address');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`; const endpoint = 'advisor-wire-test';
  declareEndpoint(endpoint, { ...endpointShape('openai-compatible'), requestBound: value => {
    const body = JSON.parse(value.body); return { inputTokens: Buffer.byteLength(value.body), outputTokens: body.max_tokens ?? body.max_completion_tokens,
      source: 'isolated-test-protocol', version: '1' };
  } });
  const config = { ...getRuntimeConfig(setup.root), retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0, maxOutputTokens: 10,
    providerConnectTimeoutMs: 3000, providerHeadersTimeoutMs: 3000, providerBodyTimeoutMs: 3000 };
  const request: ProviderStepHost = { providerMode: 'real', providerCredentialResolution: {
    provider: 'openai', model: 'primary-model', baseUrl, expectedEnvVarName: 'OPENAI_API_KEY',
    credential: { provider: 'openai', authMode: 'api-key', apiKey: 'synthetic-wire-only', model: 'primary-model', baseUrl, source: 'cli', envVarName: 'OPENAI_API_KEY' } },
    workspaceRoot: setup.root, sessionId: setup.session.id, runtimeConfig: config,
    providerCatalog: [{ id: 'openai', label: 'Isolated wire fixture', runtime: 'openai', auth: 'api-key', endpoint, baseUrl, models: [{ id: 'review-model', contextWindow: 10000, maxTokens: 10 }] }],
    requestPolicy: goalRequestPolicy(setup.manager, setup.session), agentMode: 'build' };
  const main = vi.fn(async () => ({ text: 'WRONG_PARENT_STEP', toolCalls: [], stopReason: 'stop' as const }));
  const runner = createSubagentRunner({ step: main, stepForModel: delegatedSteps(request, new Map(), {}), defaultMaxSteps: 1,
    retry: { enabled: config.retryEnabled, maxRetries: config.retryMaxRetries } }, new Map(), {
    sessionId: setup.session.id, workspaceRoot: setup.root, agentMode: 'build', permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {} });
  return { received, request, main, runner };
}

it('sends actual different body.model with independent tool-free context, shares main goal usage and refuses a lowered cap without fallback', async () => {
  const setup = createAdvisorHarness(); writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Independent review' });
  const server = await wire(setup); const mainStep = createProviderStep(server.request, new Map(), {});
  await mainStep([{ role: 'user', content: 'PRIVATE_MAIN_CONTEXT_NOT_INCLUDED_IN_REVIEW' }], setup.signal, {}, { allowTools: false });
  await setup.runtime.capture(setup.boundary('BOUND_SNAPSHOT_TOOL_EVIDENCE'), server.runner, setup.signal);
  expect(server.main).not.toHaveBeenCalled(); expect(server.received.map(body => body.model)).toEqual(['primary-model', 'review-model']);
  expect(JSON.stringify(server.received[1])).toContain('BOUND_SNAPSHOT_TOOL_EVIDENCE');
  expect(JSON.stringify(server.received[1])).not.toContain('PRIVATE_MAIN_CONTEXT_NOT_INCLUDED_IN_REVIEW'); expect(server.received[1]!.tools ?? []).toHaveLength(0);
  expect(setup.runtime.view().notes[0]!.text).toBe('INDEPENDENT_ADVISOR_FINDING');
  const scope = () => decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!.scopes[readGoalEdit(setup.manager, setup.session).goal!.id]!;
  expect(scope()).toMatchObject({ inputTokens: 8, outputTokens: 2, historyUnknown: false, pending: {} });
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'budget', cap: 0 });
  await setup.runtime.capture(setup.boundary('cap zero', 2), server.runner, setup.signal);
  expect(server.received).toHaveLength(2); expect(setup.runtime.view().notes).toHaveLength(1); expect(scope()).toMatchObject({ inputTokens: 8, outputTokens: 2, pending: {} });
});

it('honors retry-off at provider and native child loop while keeping HTTP bodies out of advisor reports', async () => {
  const setup = createAdvisorHarness(); writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Failed dispatch remains metered' });
  const server = await wire(setup, 503);
  await setup.runtime.capture(setup.boundary('safe fixture'), server.runner, setup.signal);
  expect(server.received).toHaveLength(1); expect(server.received[0]!.model).toBe('review-model');
  expect(server.main).not.toHaveBeenCalled(); expect(setup.runtime.view()).toMatchObject({ status: 'error', notes: [] });
  expect(setup.reports.join('\n')).not.toContain('HTTP-BODY-MUST-NOT-PUBLISH');
  const scope = decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!.scopes[readGoalEdit(setup.manager, setup.session).goal!.id]!;
  expect(Object.values(scope.pending)).toHaveLength(1); expect(Object.values(scope.pending)[0]).toMatchObject({ dispatched: true });
});

it('an unavailable exact model produces a visible failed result with zero main-model fallback sends', async () => {
  const setup = createAdvisorHarness(); const server = await wire(setup);
  const result = await server.runner({ definition: { name: 'advisor', description: 'review', systemPrompt: 'review', source: 'builtin', model: 'unknown-provider/unavailable-model', tools: [], maxTurns: 1, permissionMode: 'plan' }, prompt: 'review', workspace: setup.root });
  expect(result).toMatchObject({ failed: true, steps: 0, failure: 'Requested delegated model is unavailable.' });
  expect(server.received).toHaveLength(0); expect(server.main).not.toHaveBeenCalled();
});
