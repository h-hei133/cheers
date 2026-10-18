import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { writeCatalogCache, loadCatalog } from '../../core/models/catalogStore.js';
import { runModelPresetCommand } from '../../core/commands/model/presetCommand.js';
import { projectSessionModel } from '../../session/model/projection.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { runCliRuntimeInvocation } from '../../entrypoints/cliRuntimeInvocation.js';
import { createTaskToolDefinition } from '../../core/tools/taskTool.js';
import { writeGoal, readGoalEdit } from '../../planning/goal/store.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { readBoundSessionState } from '../../session/store/bound.js';

const servers: http.Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  cleanupAdvisorHarnesses();
});

async function fixture(definition = '') {
  const setup = createAdvisorHarness(false, false);
  vi.stubEnv('OPENAI_API_KEY', '');
  const requests: Array<{ path: string; credential?: string; model: string; effort?: string; tools?: unknown[]; messages: unknown[] }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ path: request.url!, credential: request.headers.authorization, model: body.model, effort: body.reasoning_effort, tools: body.tools, messages: body.messages });
    const message = requests.length === 1 ? { role: 'assistant', content: '', tool_calls: [{ id: 'task-1', type: 'function',
      function: { name: 'task', arguments: JSON.stringify({ description: 'Inspect', prompt: 'Independent inspection', subagent_type: 'inspect' }) } }] }
      : { role: 'assistant', content: 'Fixture result' };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture address');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', maxOutputTokens: 10, reserveTokens: 100,
    retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0,
    providerConnections: ['a', 'b'].map(id => ({ id, provider: 'openai', authType: 'api-key', apiKey: `synthetic-${id}`,
      model: 'main', baseUrl: `http://127.0.0.1:${address.port}/${id}/v1`, status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' })) },
  readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'main', reasoning: true, contextWindow: 32000, maxTokens: 10 },
    { id: 'namespace/child', reasoning: true, contextWindow: 32000, maxTokens: 10 }] }]);
  fs.mkdirSync(path.join(setup.root, '.agents'));
  fs.writeFileSync(path.join(setup.root, '.agents', 'inspect.md'), `---\nname: inspect\ndescription: Inspect independently\ntools: []\nmaxTurns: 1\n${definition}---\nRead the supplied evidence.`);
  const context = { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id };
  expect((await runModelPresetCommand(['save', 'work', '--profile', 'default=a/main@low', 'subagent=b/namespace/child@high'], context)).output).toContain('saved');
  expect((await runModelPresetCommand(['apply', 'work', '--all'], context)).output).toContain('all roles applied');
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Inspect fixture' });
  return { ...setup, requests, context };
}

async function invoke(setup: Awaited<ReturnType<typeof fixture>>) {
  const config = projectSessionModel(getRuntimeConfig(setup.root), setup.session.id);
  const run = await runCliRuntimeInvocation({ sessionId: setup.session.id, workspaceRoot: setup.root, prompt: 'Inspect with a subagent',
    agentMode: 'build', permissionScope: 'allow-all', signal: setup.signal, maxTurns: 3,
    runtimeConfig: config, providerCatalog: loadCatalog(), providerCredentialResolution: resolveProviderCredential({ runtimeConfig: config, env: {} }),
    providerModeEnv: 'real', requestPolicy: goalRequestPolicy(setup.manager, setup.session),
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'deny', respondedAt: Date.now() }),
  }, { checkProviderReadiness: async () => ({ ok: true }), tools: () => new Map([['task', createTaskToolDefinition()]]) });
  for await (const _event of run.events) { /* Consume the real invocation, child runner, HTTP and ledger. */ }
}

it.each([
  ['', '/b/v1/chat/completions', 'namespace/child', 'high', 'synthetic-b'],
  ['effort: low\n', '/b/v1/chat/completions', 'namespace/child', 'low', 'synthetic-b'],
  ['model: a/main\n', '/a/v1/chat/completions', 'main', 'low', 'synthetic-a'],
])('applies the active subagent policy through real CLI invocation with definition %j', async (definition, requestPath, model, effort, credential) => {
  const setup = await fixture(definition); const global = fs.readFileSync(getUserRuntimeConfigPath());
  await invoke(setup);
  expect(setup.requests.map(({ path, model, effort, credential }) => ({ path, model, effort, credential }))).toEqual([
    { path: '/a/v1/chat/completions', model: 'main', effort: 'low', credential: 'Bearer synthetic-a' },
    { path: requestPath, model, effort, credential: `Bearer ${credential}` },
    { path: '/a/v1/chat/completions', model: 'main', effort: 'low', credential: 'Bearer synthetic-a' },
  ]);
  expect(setup.requests[1].tools ?? []).toHaveLength(0);
  const report = JSON.stringify(setup.requests[2].messages);
  expect(report).toContain(`**Requested model**: ${definition.startsWith('model:') ? 'a/main' : 'b/namespace/child'}`);
  if (!definition.startsWith('model:')) {
    expect(report).toContain(`**Requested effort**: ${effort}`);
    expect(report).toContain('**Model source**: session role');
  }
  expect(report).not.toContain('inherited from parent');
  const scope = readGoalEdit(setup.manager, setup.session).goal!.id;
  expect(decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!.scopes[scope]).toMatchObject({ inputTokens: 12, outputTokens: 3, pending: {} });
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
});

it.each(['deleted', 'provider-reused', 'scope'])('refuses a %s subagent binding without falling back to the parent account', async change => {
  const setup = await fixture(); const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values,
    ...(change === 'scope' ? { allowedModels: ['openai/main'] } : {}),
    providerConnections: change === 'deleted' ? edit.values.providerConnections!.filter(item => item.id !== 'b')
      : edit.values.providerConnections!.map(item => item.id === 'b' && change === 'provider-reused' ? { ...item, provider: 'google' as const } : item),
  }, edit);
  await invoke(setup);
  expect(setup.requests.map(row => row.path)).toEqual(['/a/v1/chat/completions', '/a/v1/chat/completions']);
});
