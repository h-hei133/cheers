import fs from 'node:fs';
import http from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses, advisorResult } from '../../test-utils/advisor.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { ConfigState } from '../../config/state.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { loadCatalog, writeCatalogCache } from '../../core/models/catalogStore.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { runModelPresetCommand } from '../../core/commands/model/presetCommand.js';
import { projectSessionModel } from '../../session/model/projection.js';
import { readSessionModelEdit, writeSessionModel } from '../../session/model/state.js';
import { runCliRuntimeInvocation } from '../../entrypoints/cliRuntimeInvocation.js';
import { writeGoal, readGoalEdit } from '../../planning/goal/store.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { runAdvisorCommand } from '../../advisor/command.js';
import type { SubagentRunInput, SubagentRunResult } from '../../core/subagents/runner.js';
import { advisorFor, advisorCheckpointFor } from './advisor.js';

const servers: http.Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  cleanupAdvisorHarnesses();
});

async function fixture() {
  const setup = createAdvisorHarness(false, false);
  vi.stubEnv('OPENAI_API_KEY', '');
  const callbacks: { main?: () => void } = {};
  const requests: Array<{ path: string; credential?: string; model: string; effort?: string; tools?: unknown[]; messages: unknown[] }> = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push({ path: request.url!, credential: request.headers.authorization, model: body.model, effort: body.reasoning_effort, tools: body.tools, messages: body.messages });
    if (body.model === 'main') callbacks.main?.();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Advisor fixture answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
  });
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', maxOutputTokens: 10, reserveTokens: 100,
    retryEnabled: false, retryMaxRetries: 0, providerRetryMaxRetries: 0, cacheWarming: 'off',
    providerConnections: ['a', 'b'].map(id => ({ id, provider: 'openai', authType: 'api-key', apiKey: `synthetic-${id}`, model: 'main',
      baseUrl: `http://127.0.0.1:${address.port}/${id}/v1`, status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' })) },
  readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'main', reasoning: true, contextWindow: 32000, maxTokens: 10 },
    { id: 'namespace/advisor', reasoning: true, contextWindow: 32000, maxTokens: 10 }] }]);
  const command = { cwd: setup.root, projectRoot: setup.root, sessionId: setup.session.id };
  expect((await runModelPresetCommand(['save', 'work', '--profile', 'default=a/main@low', 'advisor=b/namespace/advisor@high'], command)).output).toContain('saved');
  expect((await runModelPresetCommand(['apply', 'work', '--all'], command)).output).toContain('all roles applied');
  const config = projectSessionModel(getRuntimeConfig(setup.root), setup.session.id);
  const binding = { projectRoot: setup.root, session: setup.session };
  const configuration = new ConfigState(config, configurationBinding(binding), loadCatalog());
  const context = { ...binding, cwd: setup.root, configuration } as ShellRuntimeContext;
  const reports: string[] = [];
  const renderer = { renderLine: (text: string) => reports.push(text) };
  const advisor = advisorFor(context, setup.manager, renderer);
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Advisor fixture' });
  return { ...setup, requests, command, context, renderer, advisor, reports, callbacks };
}

async function invoke(setup: Awaited<ReturnType<typeof fixture>>) {
  const config = projectSessionModel(getRuntimeConfig(setup.root), setup.session.id);
  const run = await runCliRuntimeInvocation({ sessionId: setup.session.id, workspaceRoot: setup.root, prompt: 'Review fixture',
    agentMode: 'build', permissionScope: 'ask', signal: setup.signal, maxTurns: 1, runtimeConfig: config, providerCatalog: loadCatalog(),
    providerCredentialResolution: resolveProviderCredential({ runtimeConfig: config, env: {} }), providerModeEnv: 'real',
    requestPolicy: goalRequestPolicy(setup.manager, setup.session),
    checkpoint: advisorCheckpointFor(setup.context, setup.manager, setup.renderer, setup.sourcePromptEntryId),
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'deny', respondedAt: Date.now() }),
  }, { checkProviderReadiness: async () => ({ ok: true }), tools: () => new Map() });
  for await (const _event of run.events) { /* Exercise the actual main turn and delegated request. */ }
}

it.each([false, true])('uses the automatic advisor role with explicit override %s only after enable', async explicit => {
  const setup = await fixture(); const global = fs.readFileSync(getUserRuntimeConfigPath());
  expect(setup.advisor.view().status).toBe('off');
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['main']);
  if (explicit) await runAdvisorCommand(['configure', 'a/namespace/advisor'], setup.command, setup.advisor, false);
  expect((await runAdvisorCommand(['on'], setup.command, setup.advisor, false)).kind).toBe('local');
  await invoke(setup);
  const selected = explicit ? { path: '/a/v1/chat/completions', credential: 'Bearer synthetic-a', effort: 'low' }
    : { path: '/b/v1/chat/completions', credential: 'Bearer synthetic-b', effort: 'high' };
  expect(setup.requests).toHaveLength(3);
  expect(setup.requests[2]).toMatchObject({ ...selected, model: 'namespace/advisor' });
  expect(setup.requests[2].tools ?? []).toEqual([]);
  expect(setup.advisor.view().notes).toHaveLength(1);
  expect(setup.advisor.view().notes[0]).toMatchObject({ target: explicit ? 'a/namespace/advisor' : 'b/namespace/advisor@high' });
  expect(setup.advisor.view().notes[0].targetIdentity).toMatch(/^[a-f0-9]{64}$/);
  const scope = readGoalEdit(setup.manager, setup.session).goal!.id;
  expect(decodeRequestLedger(readBoundSessionState(setup.manager, setup.session).state.requestLedger)!.scopes[scope]).toMatchObject({ inputTokens: 12, outputTokens: 3, pending: {} });
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
});

it('configure without a target clears an explicit override and stays off until enabled', async () => {
  const setup = await fixture();
  await runAdvisorCommand(['configure', 'a/namespace/advisor'], setup.command, setup.advisor, false);
  await runAdvisorCommand(['configure', '--every', '2'], setup.command, setup.advisor, false);
  expect(setup.advisor.view()).toMatchObject({ enabled: false, config: { every: 2 } });
  expect(setup.advisor.view().config?.target).toBeUndefined();
  expect(setup.requests).toHaveLength(0);
});

it.each(['deleted', 'reused', 'scope', 'effort'] as const)('refuses a %s advisor binding without sending a substitute', async change => {
  const setup = await fixture();
  const publication = setup.context.configuration.current;
  const config = { ...publication.config,
    ...(change === 'scope' ? { allowedModels: ['openai/main'] } : {}),
    providerConnections: change === 'deleted' ? publication.config.providerConnections.filter(item => item.id !== 'b')
      : publication.config.providerConnections.map(item => item.id === 'b' && change === 'reused' ? { ...item, provider: 'google' as const } : item) };
  const catalog = change === 'effort' ? publication.catalog.map(provider => ({ ...provider,
    models: provider.models.map(model => model.id === 'namespace/advisor' ? { ...model, reasoning: false } : model) })) : publication.catalog;
  const ticket = setup.context.configuration.begin(publication.binding);
  expect(setup.context.configuration.publish(ticket, config, publication.binding, undefined, catalog).status).toBe('applied');
  setup.advisor.setEnabled(true);
  const runner = vi.fn(async () => advisorResult());
  await setup.advisor.capture(setup.boundary('Unavailable role'), runner, setup.signal);
  expect(runner).not.toHaveBeenCalled();
  expect(setup.advisor.view()).toMatchObject({ status: 'unavailable', notes: [] });
  expect(setup.advisor.view().pending).toBeUndefined();
  expect(setup.requests).toHaveLength(0);
});

it.each(['remove', 'change-back', 'configuration'] as const)('a %s during review fences dispatch admission and publication', async change => {
  const setup = await fixture(); setup.advisor.setEnabled(true);
  let finish!: (result: SubagentRunResult) => void;
  let start!: () => void; const started = new Promise<void>(resolve => { start = resolve; });
  let captured!: SubagentRunInput;
  const running = setup.advisor.capture(setup.boundary('Bound review'), input => { captured = input; start(); return new Promise(resolve => { finish = resolve; }); }, setup.signal);
  await started;
  const edit = readSessionModelEdit(setup.session.id); const original = edit.selection!;
  if (change === 'configuration') setup.context.configuration.recordDisplay({ theme: 'light' });
  else {
    writeSessionModel(setup.session.id, { ...original, roles: {} }, edit);
    if (change === 'change-back') writeSessionModel(setup.session.id, original, readSessionModelEdit(setup.session.id));
  }
  expect(captured.admission?.()).toContain('changed');
  finish(advisorResult('Late advice')); await running;
  expect(setup.advisor.view().notes).toHaveLength(0);
  expect(setup.advisor.view().pending).toBeUndefined();
  expect(setup.requests).toHaveLength(0);
});

it('a published note cannot be applied after the role revision changes', async () => {
  const setup = await fixture(); setup.advisor.setEnabled(true); await invoke(setup);
  const note = setup.advisor.view().notes[0]!;
  const edit = readSessionModelEdit(setup.session.id);
  writeSessionModel(setup.session.id, { ...edit.selection!, roles: {} }, edit);
  expect(() => setup.advisor.apply(note.id)).toThrow(/stale/);
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['main', 'namespace/advisor', 'main']);
  expect(setup.advisor.view().status).toBe('unavailable');
});

it('manual review refuses an old provider closure after a same-role connection reload', async () => {
  const setup = await fixture(); setup.advisor.setEnabled(true); await invoke(setup);
  const publication = setup.context.configuration.current;
  const config = { ...publication.config, providerConnections: publication.config.providerConnections.map(connection => connection.id === 'b'
    ? { ...connection, apiKey: 'synthetic-b-renewed', baseUrl: connection.baseUrl!.replace('/b/', '/changed/') } : connection) };
  const ticket = setup.context.configuration.begin(publication.binding);
  expect(setup.context.configuration.publish(ticket, config, publication.binding).status).toBe('applied');
  const output = await runAdvisorCommand(['review'], setup.command, setup.advisor, false);
  expect(output.kind).toBe('local');
  expect(setup.requests).toHaveLength(2);
  expect(setup.advisor.view().status).toBe('error');
  expect(setup.advisor.view().pending).toBeUndefined();
  expect(setup.advisor.view().notes).toHaveLength(1);
});

it('reports a publication change during the main request and resumes advice on a fresh turn', async () => {
  const setup = await fixture(); setup.advisor.setEnabled(true);
  setup.callbacks.main = () => { setup.context.configuration.recordDisplay({ theme: 'light' }); setup.callbacks.main = undefined; };
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['main']);
  expect(setup.advisor.view().checkpoints).toHaveLength(0);
  expect(setup.reports.join('\n')).toContain('Advisor checkpoint skipped because its request configuration changed.');
  await invoke(setup);
  expect(setup.requests.map(row => row.model)).toEqual(['main', 'main', 'namespace/advisor']);
  expect(setup.advisor.view().notes).toHaveLength(1);
});
