import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, type RuntimeConfigFile } from '../../config/runtimeConfig.js';
import { userCatalogPath } from '../models/catalogStore.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../shell/runtimeContext.js';
import { configurationAdmission } from '../shell/configuration.js';
import { resolveCliCredential } from '../../cli/provider/cliProviderRuntimeBridge.js';
import { SessionManager } from '../../session/SessionManager.js';
import { recordRequestContext, recordSessionUsage } from '../../observability/usageTelemetry.js';
import { requestContext } from '../../context/request/projection.js';
import * as transport from '../../provider/request/fetch.js';
import * as refresh from '../models/catalogRefresh.js';
import { runBtwCommand } from './btwCommandRuntime.js';
import { runContextCommand } from './contextCommandRuntime.js';
import { runModelCommand } from './modelCommandRuntime.js';
import { modelPicker } from '../../cli/interactive/picker/model.js';
import { connectionPicker } from '../../cli/interactive/picker/connections.js';
import { activeModelName, readStatusFacts, readWelcomeState } from '../../cli/interactive/sessionFacts.js';
import { createCatalogLoader, catalogIdentity } from '../../cli/interactive/completion/catalog.js';
import { buildCliCommandExecution } from '../../entrypoints/cliCommandExecutionBridge.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { CliMcpGateway } from '../../entrypoints/cliMcpModule.js';
import type { CommandContext } from './types.js';

let root: string;
let file: string;
let settings: RuntimeConfigFile;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-config-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  file = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(file), { recursive: true });
  const connection = { authType: 'api-key' as const, apiKey: 'saved-synthetic', createdAt: '2026-01-01', updatedAt: '2026-01-01' };
  settings = { provider: 'openai', activeProviderConnectionId: 'main', maxOutputTokens: 1024, reserveTokens: 8000,
    providerConnections: [{ ...connection, id: 'main', provider: 'openai', model: 'other' },
      { ...connection, id: 'alternate', provider: 'google', model: 'chosen', baseUrl: 'https://chosen.invalid' }],
    modelTokenBudgets: { 'google/chosen': { reserveTokens: 0 } } };
  fs.writeFileSync(file, JSON.stringify(settings));
  catalog();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function catalog(extra = 'accepted-only', window = 16000) {
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: {
    google: { endpoint: 'openai-compatible', models: [
      { id: 'chosen', contextWindow: window, maxTokens: 2048, cost: { promptPerMTok: window / 1000, completionPerMTok: 0 }, compat: { supportsTemperature: false } }, { id: extra },
    ] },
    custom: { runtime: 'openai-compatible', baseUrl: `https://${extra}.invalid`, models: [{ id: extra }] },
  } }));
}
function fixture() {
  const shell = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session: new SessionManager().createNew(root), runtimeConfig: getRuntimeConfig(root),
    resolveConfigTarget: config => resolveCliCredential(config, { provider: 'google', apiKey: 'cli-synthetic' }, {}) });
  const context: CommandContext = { cwd: root, projectRoot: root, sessionId: shell.session.id,
    runtimeConfig: shell.runtimeConfig, readConfiguration: () => shell.configuration.current,
    resolveConfigTarget: shell.resolveConfigTarget, admission: configurationAdmission(shell),
    refreshRuntimeConfig: () => refreshShellRuntimeConfig(shell), getToolPool: async () => new Map() };
  return { shell, context };
}

it.each(['before', 'after'] as const)('rejects obsolete context report admission %s catalog loading', async phase => {
  const { context } = fixture(); let stale = phase === 'before', release!: () => void;
  const read = vi.fn(context.readConfiguration!);
  const getToolPool = vi.fn(async () => { if (phase === 'after') await new Promise<void>(resolve => { release = resolve; }); return new Map(); });
  const pending = runContextCommand([], { ...context, readConfiguration: read, getToolPool,
    admission: () => stale ? 'original binding changed' : undefined });
  if (phase === 'after') { await vi.waitFor(() => expect(release).toBeTypeOf('function')); stale = true; release(); }
  else release?.();
  const result = await pending;
  expect(result.output).toBe('original binding changed'); expect(result.report).toBeUndefined();
  if (phase === 'before') { expect(read).not.toHaveBeenCalled(); expect(getToolPool).not.toHaveBeenCalled(); }
});

it('uses the original workspace to project accepted request identity without changing raw measurements', async () => {
  const { context } = fixture();
  const captured = requestContext({ body: '{"messages":[],"unicode":"😀"}', provider: 'google', model: 'chosen', endpoint: `file://${root}/protocol` });
  recordRequestContext(context.sessionId!, captured);
  const result = await runContextCommand([], context);
  expect(result.report?.facts.request).toMatchObject({ provider: 'google', model: 'chosen', endpoint: '[project]/protocol', body: captured.body,
    usage: { status: 'unknown' } });
  expect(captured.endpoint).toBe(`file://${root}/protocol`);
});

it('keeps menus, completion, and context on the accepted catalogue until successful reload', async () => {
  const { shell, context } = fixture();
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no implicit network'));
  const loader = createCatalogLoader(() => shell, {} as CliMcpGateway, []);
  const identity = catalogIdentity(shell);
  catalog('pending-only', 24000);
  recordSessionUsage(shell.session.id, { promptTokens: 1000, completionTokens: 10, provider: 'google', model: 'chosen' });
  const facts = readStatusFacts(shell);
  expect(facts).toMatchObject({ provider: 'google', model: 'chosen', contextWindow: 16000, contextWindowSource: 'catalog', costRates: 'catalog' });
  expect(facts.costUsd).toBeCloseTo(0.016);
  expect(activeModelName(shell)).toBe('chosen');
  expect(readWelcomeState(shell, undefined, false).model).toBe('chosen');
  const connections = connectionPicker(context);
  expect((await connections.load()).find(row => row.id === 'login:custom')?.detail).toContain('accepted-only');
  expect((await connections.apply(['login:custom']))?.draft).toContain('--model accepted-only');
  const report = await runContextCommand([], context);
  expect(report.output).toContain('of 16,000 tokens');
  expect(report.output).toContain('13,976 free before the 0-token reserve');
  expect(report.output).toContain('0 current definitions');
  expect(report.output).not.toContain('Instructions and conversation');
  for (const args of [[], ['list'], ['list', 'google']]) {
    const result = await runModelCommand(args, context);
    expect(result.output).toContain('accepted-only'); expect(result.output).not.toContain('pending-only');
  }
  const models = await modelPicker(context).load();
  expect(models.find(row => row.note === 'active')).toMatchObject({ label: 'chosen', detail: expect.stringContaining('cli') });
  expect(models.some(row => row.label === 'accepted-only')).toBe(true);
  expect(models.some(row => row.label === 'pending-only')).toBe(false);
  expect((await loader('model', new AbortController().signal)).map(row => row.value)).toContain('google/accepted-only');
  expect(fetch).not.toHaveBeenCalled();
  fs.writeFileSync(file, JSON.stringify({ ...settings, maxOutputTokens: 3000 }));
  expect(refreshShellRuntimeConfig(shell).status).toBe('rejected');
  expect((await runModelCommand(['list'], context)).output).toContain('accepted-only');
  expect(readStatusFacts(shell)).toMatchObject({ contextWindow: 16000, costUsd: facts.costUsd });
  expect((await connections.apply(['login:custom']))?.draft).toContain('--model accepted-only');
  fs.writeFileSync(file, JSON.stringify(settings));
  expect(refreshShellRuntimeConfig(shell).status).toBe('applied');
  expect(catalogIdentity(shell)).not.toBe(identity);
  expect((await runModelCommand(['list'], context)).output).toContain('pending-only');
  expect((await loader('model', new AbortController().signal)).map(row => row.value)).toContain('google/pending-only');
  expect((await runContextCommand([], context)).output).toContain('of 24,000 tokens');
  expect(readStatusFacts(shell)).toMatchObject({ contextWindow: 24000 });
  expect(readStatusFacts(shell).costUsd).toBeCloseTo(0.024);
  expect((await connections.load()).find(row => row.id === 'login:custom')?.detail).toContain('pending-only');
  expect((await connections.apply(['login:custom']))?.draft).toContain('--model pending-only');
});

it('uses the host credential and one accepted configuration for a side question through the command bridge', async () => {
  const { shell, context } = fixture();
  const sent: Array<{ url: string; init?: RequestInit }> = [];
  vi.spyOn(transport, 'providerFetchForEndpoint').mockImplementation(() => (async (url, init) => {
    sent.push({ url: String(url), init });
    fs.writeFileSync(file, JSON.stringify({ ...settings, maxOutputTokens: 512 }));
    catalog('next-only', 24000);
    expect(refreshShellRuntimeConfig(shell).status).toBe('applied');
    return Response.json({ choices: [{ message: { content: 'side answer' }, finish_reason: 'stop' }] });
  }) as typeof fetch);
  const lines: string[] = [];
  await buildCliCommandExecution({ ...context, prompt: '/btw question', interactive: true, printMode: false,
    renderer: { renderLine: line => lines.push(line) } as StreamingRenderer });
  expect(lines.join(' ')).toContain('side answer');
  expect(sent[0].url).toBe('https://chosen.invalid/chat/completions');
  expect(new Headers(sent[0].init?.headers).get('authorization')).toBe('Bearer cli-synthetic');
  expect(JSON.parse(String(sent[0].init?.body))).toMatchObject({ model: 'chosen', max_tokens: 1024 });
  expect(JSON.parse(String(sent[0].init?.body))).not.toHaveProperty('temperature');
  await runBtwCommand(['next'], context);
  expect(JSON.parse(String(sent[1].init?.body))).toMatchObject({ model: 'chosen', max_tokens: 512 });
  expect(lines.join(' ')).not.toMatch(/cli-synthetic|saved-synthetic/);
});

it('publishes an explicit catalogue refresh and retains accepted values when publication fails', async () => {
  const { shell, context } = fixture();
  const refreshSpy = vi.spyOn(refresh, 'refreshCatalog').mockImplementation(async () => {
    catalog('refreshed-only', 24000);
    return { ok: true, providers: 1, models: 2, cachePath: 'synthetic-cache' };
  });
  expect((await runModelCommand(['list', 'does-not-exist', '--refresh'], context)).output).toContain('Unknown provider');
  expect(refreshSpy).not.toHaveBeenCalled();
  fs.writeFileSync(file, JSON.stringify({ ...settings, maxOutputTokens: 3000 }));
  const failed = await runModelCommand(['list', 'google', '--refresh'], context);
  expect(failed.output).toContain('Configuration was not applied (rejected)');
  expect(failed.output).toContain('accepted-only'); expect(failed.output).not.toContain('- refreshed-only');
  fs.writeFileSync(file, JSON.stringify(settings));
  const applied = await runModelCommand(['list', 'google', '--refresh'], context);
  expect(applied.output).toContain('Catalogue applied for the next operation.');
  expect(applied.output).toContain('- refreshed-only');
  expect(shell.configuration.current.catalog.find(provider => provider.id === 'google')?.models.some(model => model.id === 'refreshed-only')).toBe(true);
});

it('accepts exact provider ids from completion before compatibility aliases without implicit network', async () => {
  const stored = JSON.parse(fs.readFileSync(userCatalogPath(), 'utf8'));
  stored.providers.MixedCase = { label: 'Custom', runtime: 'openai-compatible', models: [{ id: 'custom-model' }] };
  fs.writeFileSync(userCatalogPath(), JSON.stringify(stored));
  const { context } = fixture();
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no implicit network'));
  expect((await runModelCommand(['list', 'siliconflow'], context)).output).toContain('Models for provider=siliconflow');
  expect((await runModelCommand(['list', 'MixedCase'], context)).output).toContain('- custom-model');
  expect((await runModelCommand(['list', 'openai-compatible'], context)).output).toContain('No models listed for this provider.');
  expect(fetch).not.toHaveBeenCalled();
});
