import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { readSessionModel, readSessionModelEdit } from './state.js';
import { projectSessionModel } from './projection.js';
import { modelPicker } from '../../cli/interactive/picker/model.js';
import { thinkingPicker } from '../../cli/interactive/picker/thinking.js';
import { readModelCatalog, runModelCommand } from '../../core/commands/modelCommandRuntime.js';
import { runBtwCommand } from '../../core/commands/btwCommandRuntime.js';
import { runCliRuntimeInvocation } from '../../entrypoints/cliRuntimeInvocation.js';
import { checkRealProviderReadiness } from '../../core/shell/providerReadiness.js';
import { createProviderReadinessCliTerminalEvent } from '../../entrypoints/providerReadinessCliSurface.js';
import { runExtendedContextCommand } from '../../core/commands/model/context.js';
import { setSessionServiceTier } from '../../core/commands/model/serviceTier.js';
import { runModelPresetCommand } from '../../core/commands/model/presetCommand.js';
import { writeCatalogCache, loadCatalog } from '../../core/models/catalogStore.js';
import { mergeProviders, type CatalogProvider } from '../../core/models/catalog.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { captureThinkingPreference } from '../../core/models/preference.js';
import { createProviderStep } from '../../cli/provider/step.js';
import { captureSummaryRole } from '../../cli/provider/summary.js';
import { defaultHookDispatcher } from '../../core/hooks/hookDispatcher.js';

let home: string;
let sessionId: string;
let server: http.Server;
let baseUrl: string;
const requests: { url: string; authorization?: string; apiKey?: string; body: Record<string, unknown> }[] = [];
beforeEach(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-catalog-target-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  requests.length = 0;
  server = http.createServer(async (request, response) => {
    if (request.method === 'GET') {
      requests.push({ url: request.url!, body: {} });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'shared' }] }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ url: request.url!, authorization: request.headers.authorization, apiKey: request.headers['x-api-key'] as string | undefined,
      body: JSON.parse(Buffer.concat(chunks).toString()) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(request.url?.startsWith('/b/')
      ? { id: 'fixture', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'Relay B answered.' }], stop_reason: 'end_turn', usage: { input_tokens: 4, output_tokens: 1 } }
      : { choices: [{ message: { role: 'assistant', content: 'Relay A answered.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture address unavailable');
  baseUrl = `http://127.0.0.1:${address.port}`;
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'a', reserveTokens: 0, maxOutputTokens: 100, retryEnabled: false,
    providerConnections: ['a', 'b'].map(id => ({ id, provider: 'openai', authType: 'api-key', apiKey: `synthetic-${id}`,
      model: 'shared', baseUrl: `${baseUrl}/${id}/v1`, thinkingEffort: 'high', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' })) }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  catalogue();
  sessionId = new SessionManager().createNew(home).id;
});
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true });
});
const context = () => ({ cwd: home, projectRoot: home, sessionId });
const row = (connection: string, owner = 'openai') => `model:${JSON.stringify([connection, owner, 'shared'])}`;
function catalogue(extra: object[] = []) {
  writeCatalogCache(mergeProviders([
    { id: 'openai', models: [{ id: 'shared', reasoning: false, contextWindow: 64000, maxTokens: 4000 }] },
    { id: 'relay-a', runtime: 'openai', baseUrl: `${baseUrl}/a/v1`, endpoint: 'openai-compatible', models: [{ id: 'shared', reasoning: true,
      contextWindow: 16000, maxTokens: 100, thinkingLevelMap: { high: 'strong' }, serviceTiers: ['flex'], compat: { maxTokensField: 'max_completion_tokens', supportsTemperature: false } }] },
    { id: 'relay-b', runtime: 'openai', baseUrl: `${baseUrl}/b/v1`, endpoint: 'anthropic-messages', models: [{ id: 'shared', reasoning: true,
      contextWindow: 32000, maxTokens: 200, thinkingLevelMap: { high: null } }] },
  ] as CatalogProvider[], extra));
}
async function send() {
  const config = projectSessionModel(getRuntimeConfig(home), sessionId);
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
  const step = createProviderStep({ runtimeConfig: config, providerCatalog: loadCatalog(), providerCredentialResolution: resolution,
    providerMode: 'real', agentMode: 'build', workspaceRoot: home, sessionId, ...captureThinkingPreference(home, resolution.thinkingEffort) }, new Map(), {});
  return step([{ role: 'user', content: 'Check this relay metadata.' }], new AbortController().signal, {}, { allowTools: false });
}

it('shows and sends exact relay metadata through both generic and relay-specific catalogue rows', async () => {
  const global = fs.readFileSync(getUserRuntimeConfigPath());
  const picker = modelPicker(context());
  const rows = await picker.load();
  for (const owner of ['openai', 'relay-a']) {
    expect(rows.find(item => item.id === row('a', owner))?.disabled).not.toBe(true);
    expect(picker.detail?.(row('a', owner))).toContain('Context: 16000 tokens');
  }
  expect(rows.find(item => item.id === row('b'))?.disabled).toBe(true);
  expect(picker.detail?.(row('b'))).toContain('Context: 32000 tokens');
  expect(requests).toHaveLength(0);
  expect((await readModelCatalog(false, sessionId, getRuntimeConfig(home))).models).toEqual(['shared']);
  expect((await runModelCommand(['list'], context())).output).not.toContain('gpt-5.3');
  expect((await picker.apply([row('a', 'relay-a')]))?.note).toContain('Connection: a');
  expect(setSessionServiceTier(context(), 'flex')).toContain('Service tier set to flex');
  expect((await runExtendedContextCommand(['on'], context())).output).toContain('16000');
  expect((await send()).text).toContain('Relay A answered.');
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ url: '/a/v1/chat/completions', authorization: 'Bearer synthetic-a', body: {
    model: 'shared', reasoning_effort: 'strong', max_completion_tokens: 100, service_tier: 'flex',
  } });
  expect(requests[0].body).not.toHaveProperty('temperature');
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
});

it('uses another protocol and its output ceiling after explicitly choosing a compatible effort', async () => {
  expect((await runModelCommand(['shared', '--effort', 'auto'], context())).output).toContain('Model switched');
  const picker = modelPicker(context()); await picker.load();
  expect((await picker.apply([row('b', 'relay-b')]))?.note).toContain('Connection: b');
  expect(setSessionServiceTier(context(), 'flex')).toContain('does not advertise flex');
  expect((await runExtendedContextCommand(['on'], context())).output).toContain('32000');
  expect((await send()).text).toContain('Relay B answered.');
  expect(requests[0]).toMatchObject({ url: '/b/v1/messages', apiKey: 'synthetic-b', body: { model: 'shared', max_tokens: 100 } });
  const thinking = thinkingPicker(context());
  expect((await thinking.load()).find(item => item.id === 'high')?.disabled).toBe(true);
  expect((await thinking.apply(['high']))?.note).toContain('does not support');
  expect(readSessionModel(sessionId)?.thinkingEffort).toBeNull();
});

it('binds thinking choices and selection hooks to the displayed relay catalogue revision', async () => {
  const thinking = thinkingPicker(context()); await thinking.load();
  catalogue([{ id: 'relay-a', models: [{ id: 'shared', reasoning: false }] }]);
  const before = readSessionModelEdit(sessionId);
  expect((await thinking.apply(['high']))?.note).toContain('expired');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  catalogue();
  vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') catalogue([{ id: 'relay-a', models: [{ id: 'shared', maxTokens: 50 }] }]);
    return undefined;
  });
  expect((await runModelCommand(['shared'], context())).output).toContain('conflict');
  expect(readSessionModelEdit(sessionId)).toEqual(before);
  expect(requests).toHaveLength(0);
});

it('validates preset roles and summary limits against their own relay metadata', async () => {
  expect((await runModelPresetCommand(['save', 'work', '--profile', 'default=a/shared@high', 'summary=a/shared@high'], context())).output).toContain('saved');
  expect((await runModelPresetCommand(['apply', 'work', '--all'], context())).output).toContain('all roles applied');
  const config = projectSessionModel(getRuntimeConfig(home), sessionId);
  const summary = captureSummaryRole({ config, catalog: loadCatalog(), workspaceRoot: home });
  expect(summary?.limits).toMatchObject({ contextWindow: 16000, maxOutputTokens: 100 });
  expect((await summary?.resolve())?.shape).toMatchObject({ thinkingLevelName: 'strong', maxTokensField: 'max_completion_tokens', supportsTemperature: false });
  expect((await runModelPresetCommand(['save', 'invalid', '--profile', 'default=a/shared@high', 'summary=b/shared@high'], context())).output).toContain('unsupported');
  expect(requests).toHaveLength(0);
});

it('edits summary effort using the exact relay capability while preserving the default relay effort', async () => {
  writeCatalogCache(loadCatalog().map(provider => provider.id === 'relay-b' ? { ...provider, endpoint: 'openai-compatible' } : provider));
  expect((await runModelPresetCommand(['save', 'work', '--profile', 'default=a/shared@high', 'summary=b/shared@auto'], context())).output).toContain('saved');
  expect((await runModelPresetCommand(['apply', 'work', '--all'], context())).output).toContain('all roles applied');
  const before = readSessionModel(sessionId)!;
  const picker = modelPicker(context()); await picker.load();
  const role = (await picker.inspect!('role:summary'))!.next!; await role.load();
  const thinking = (await role.apply(['thinking']))!.next!;
  expect((await thinking.load()).map(row => row.id)).toEqual(['auto', 'low', 'medium']);
  expect(await thinking.apply(['high'])).toBeUndefined();
  expect((await thinking.apply(['low']))?.note).toContain('summary uses');
  expect(readSessionModel(sessionId)).toEqual({ ...before, roles: { ...before.roles,
    summary: { ...before.roles!.summary!, thinkingEffort: 'low' } } });
  const config = projectSessionModel(getRuntimeConfig(home), sessionId);
  expect(resolveProviderCredential({ runtimeConfig: config, env: {} }).thinkingEffort).toBe('high');
  expect((await captureSummaryRole({ config, catalog: loadCatalog(), workspaceRoot: home })!.resolve()).shape.thinkingLevelName).toBe('low');
  expect(requests).toHaveLength(0);
});

it('rejects duplicate endpoint catalogue claims before selection or HTTP dispatch', async () => {
  catalogue([{ id: 'duplicate', runtime: 'openai', baseUrl: `${baseUrl}/a/v1`, models: [{ id: 'shared' }] }]);
  const picker = modelPicker(context());
  expect((await picker.load()).find(item => item.id === row('a'))?.disabled).toBe(true);
  expect((await runModelCommand(['shared'], context())).output).toContain('multiple catalogue entries');
  await expect(send()).rejects.toThrow('multiple entries');
  expect(requests).toHaveLength(0);
  expect(readSessionModel(sessionId)).toBeUndefined();
});

it.each([false, true])('refuses ambiguous metadata before real readiness or side requests (default address: %s)', async useDefault => {
  if (useDefault) {
    writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: undefined, providerConnections: [], providerCredentials: { openai: { apiKey: 'synthetic-default', model: 'shared' } }, maxOutputTokens: 100, reserveTokens: 0 }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  }
  catalogue([{ id: 'openai', baseUrl: `${baseUrl}/a/v1` },
    { id: 'duplicate', runtime: 'openai', baseUrl: `${baseUrl}/a/v1`, models: [{ id: 'shared' }] }]);
  const config = getRuntimeConfig(home);
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
  if (useDefault) { expect(resolution.baseUrl).toBeUndefined(); expect(resolution.credential?.baseUrl).toBeUndefined(); }
  const readiness = vi.fn(checkRealProviderReadiness);
  const result = await runCliRuntimeInvocation({ sessionId, workspaceRoot: home, prompt: 'No request may be sent.',
    signal: new AbortController().signal, maxTurns: 1, agentMode: 'build', runtimeConfig: config, providerCatalog: loadCatalog(),
    providerModeEnv: 'real', providerCredentialResolution: resolution,
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'deny', respondedAt: Date.now() }),
  }, { checkProviderReadiness: readiness, createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent, tools: () => new Map() });
  const events = []; for await (const event of result.events) events.push(event);
  expect(JSON.stringify(events)).toContain('multiple model catalogue entries');
  expect(readiness).not.toHaveBeenCalled();
  expect((await runBtwCommand(['No request may be sent.'], context())).output).toContain('multiple model catalogue entries');
  expect((await readModelCatalog(false, sessionId, config)).models).toEqual([]);
  expect((await runModelCommand(['list'], context())).output).toContain('multiple catalogue entries');
  expect(requests).toHaveLength(0);
});

it('uses default-address relay metadata consistently from picker and commands through main and side requests', async () => {
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: undefined, providerConnections: [], providerCredentials: { openai: { apiKey: 'synthetic-default', model: 'shared' } },
    maxOutputTokens: 100, reserveTokens: 0, retryEnabled: false }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  catalogue([{ id: 'openai', baseUrl: `${baseUrl}/a/v1` }]);
  const picker = modelPicker(context());
  const rows = await picker.load();
  expect(picker.detail?.('model:' + JSON.stringify([null, 'openai', 'shared']))).toContain('Context: 16000 tokens');
  expect(rows.find(item => item.id === 'model:' + JSON.stringify([null, 'relay-a', 'shared']))?.disabled).not.toBe(true);
  expect(picker.detail?.('model:' + JSON.stringify([null, 'relay-a', 'shared']))).toContain('Context: 16000 tokens');
  expect((await runModelCommand(['shared', '--effort', 'high'], context())).output).toContain('Model switched');
  expect((await send()).text).toContain('Relay A answered.');
  expect((await runBtwCommand(['Use the same relay.'], context())).output).toContain('Relay A answered.');
  expect(requests.map(request => request.url)).toEqual(['/a/v1/chat/completions', '/a/v1/chat/completions']);
  expect(requests[0].body).toMatchObject({ reasoning_effort: 'strong', max_completion_tokens: 100 });
  expect(requests[0].body).not.toHaveProperty('temperature');
  expect(requests[1].body).toMatchObject({ max_completion_tokens: 100 });
});
