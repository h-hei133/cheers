import { accountWire, accountCompletion } from '../../test-utils/account.js';
import { accountToken, observeOAuthRenewal } from '../../test-utils/oauth.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../../session/SessionManager.js';
import { ConfigState } from '../../config/state.js';
import { getRuntimeConfig, type RuntimeConfigFile } from '../../config/runtimeConfig.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import type { SessionRuntimeDependencies } from '../../core/shell/sessionRuntime.js';
import type { CliRuntimeInvocationInput } from '../../entrypoints/cliRuntimeInvocation.js';
import * as store from '../../session/store/sessionFileStore.js';
import * as persistence from '../../config/persistence.js';
import { createCacheWarmingRunner } from '../../turn/cacheWarm.js';
import { createCliSessionRuntime } from './cliSessionRuntimeFactory.js';

const fixture = vi.hoisted(() => ({ deps: undefined as SessionRuntimeDependencies | undefined }));
vi.mock('./goalScheduling.js', () => ({ installGoalScheduler: () => undefined }));
// This credential/transport fixture has no active goal scheduler.
vi.mock('./goal.js', () => ({ prepareGoalSession: () => undefined, goalObjectiveFor: () => undefined, goalPolicyFor: () => undefined }));
vi.mock('../../core/shell/sessionRuntime.js', () => ({ ShellSessionRuntime: class {
  constructor(deps: SessionRuntimeDependencies) { fixture.deps = deps; }
  getPermissionScope() { return 'ask'; }
  getAgentMode() { return 'plan'; }
  getCurrentRunController() { return null; }
} }));
vi.mock('../../turn/cacheWarm.js', () => ({ createCacheWarmingRunner: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('../../memory/projectMemoryLocalStore.js', () => ({ createProjectMemoryLocalStore: () => ({}) }));
vi.mock('../approval/cliApprovalEscalationBridge.js', () => ({ createCliApprovalEscalationBridge: () => vi.fn() }));
vi.mock('./cliRuntimeInvocationBridge.js', () => ({ streamCliRuntimePrompt: (input: CliRuntimeInvocationInput) => {
  input.prepareProviderResources?.(input.providerCredentialResolution); return { events: [] };
} }));
vi.mock('../../core/shell/compaction.js', () => ({ compactSessionHistory: async (input: {
  summarize: (request: { messages: []; signal: AbortSignal }) => Promise<string | undefined>; signal: AbortSignal;
}) => ({ status: 'compacted', summary: await input.summarize({ messages: [], signal: input.signal }) }) }));

let sessionManager: SessionManager;
let home: string;
let root: string;
let file: string;
let server: http.Server;
let baseUrl: string;
let received: { authorization?: string; stored: boolean }[];
const old = { type: 'openai-chatgpt-account' as const, accessToken: 'old-test', refreshToken: 'refresh-test', expiresAt: 1, accountId: 'a' };
const fresh = { ...old, accessToken: accountToken('fresh-test', 'a'), refreshToken: 'rotated-test', expiresAt: Date.now() + 3600000 };
function read(): RuntimeConfigFile { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(value: RuntimeConfigFile) { fs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); }
beforeEach(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-renewal-')); root = path.join(home, 'workspace');
  fs.mkdirSync(root); fs.mkdirSync(path.join(home, '.cheers')); file = path.join(home, '.cheers', 'auth.json');
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  sessionManager = new SessionManager({ storageDir: path.join(home, '.cheers', 'sessions') });
  sessionManager.createNewWithId('summary-renewal', root);
  received = []; vi.mocked(createCacheWarmingRunner).mockClear();
  server = http.createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume the local request */ }
    received.push({ authorization: request.headers.authorization,
      stored: read().providerConnections?.[0]?.accountAuth?.openai?.accessToken === fresh.accessToken });
    expect(request.url).toBe('/codex/responses');
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(accountCompletion('SUMMARY'));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing local address');
  accountWire(`http://127.0.0.1:${address.port}`);
  baseUrl = 'https://chatgpt.com/backend-api';
  fs.writeFileSync(path.join(home, '.cheers', 'config.json'), JSON.stringify({ offline: false }));
  write({ provider: 'openai', activeProviderConnectionId: 'a',
    providerConnections: [{ id: 'a', provider: 'openai', authType: 'account-auth', accountAuth: { openai: old },
      baseUrl, model: 'probe', status: 'connected' }] });
});
afterEach(async () => {
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true });
});

function runtime() {
  const config = getRuntimeConfig(root); const identity = { projectRoot: root, session: sessionManager.getSession('summary-renewal')! };
  const configuration = new ConfigState(config, configurationBinding(identity));
  const context = { ...identity, cwd: root, configuration, get runtimeConfig() { return configuration.current.config; } };
  const renderLine = vi.fn();
  createCliSessionRuntime({ runtimeContext: context,
    providerRuntimeBridge: { resolveCredentialSnapshot: () => resolveProviderCredential({ runtimeConfig: context.runtimeConfig, env: {} }) },
    sessionManager, renderer: { renderLine }, options: {},
    approvalTrustPolicy: {}, approvalModeState: { get: () => undefined }, getReadline: () => null,
  } as never);
  return { deps: fixture.deps!, context, renderLine };
}
function refresh(deps: SessionRuntimeDependencies) {
  deps.runPrompt('hello', new AbortController().signal);
  const options = vi.mocked(createCacheWarmingRunner).mock.calls.at(-1)![0];
  return options.refresh({ url: `${baseUrl}/codex/responses`, headers: {},
    body: JSON.stringify({ model: 'probe', messages: [{ role: 'user', content: 'hello' }] }) }, new AbortController().signal);
}

it.each(['manual', 'abandoned'])('stores rotation before %s summary HTTP dispatch', async kind => {
  observeOAuthRenewal(fresh);
  const { deps, context } = runtime();
  if (kind === 'manual') await deps.compactHistory!('summary-renewal', new AbortController().signal);
  else expect(await deps.summarizeAbandonedTurns!([])).toContain('<compacted-summary>\nSUMMARY\n</compacted-summary>');
  expect(received).toEqual([{ authorization: `Bearer ${fresh.accessToken}`, stored: true }]);
  expect(context.runtimeConfig.providerConnections[0]?.accountAuth?.openai).toMatchObject({ ...fresh, expiresAt: expect.any(Number) });
});

it.each(['manual', 'abandoned'].flatMap(kind => ['unknown', 'persisted'].map(state => ({ kind, state }))))('reports $state storage and blocks $kind dispatch/publication after verification fails', async ({ kind, state }) => {
  observeOAuthRenewal(fresh);
  if (state === 'unknown') vi.spyOn(store, 'writeTextFileAtomic').mockImplementation(() => {});
  else {
    const persist = persistence.persistConfigEdit;
    vi.spyOn(persistence, 'persistConfigEdit').mockImplementation((...args) => {
      const result = persist(...args); write({ ...read(), activeProviderConnectionId: 'changed' }); return result;
    });
  }
  const { deps, context, renderLine } = runtime(); const publication = context.configuration.current;
  if (kind === 'manual') expect(await deps.compactHistory!('summary-renewal', new AbortController().signal)).toMatchObject({
    status: 'failed', reason: expect.stringContaining(`write state: ${state}`),
  });
  else if (kind === 'abandoned') expect(await deps.summarizeAbandonedTurns!([])).toBeUndefined();
  else expect(await refresh(deps)).toBeUndefined();
  expect(received).toEqual([]); expect(context.configuration.current).toBe(publication);
  if (kind === 'manual') expect(renderLine).not.toHaveBeenCalled();
  else expect(renderLine).toHaveBeenCalledWith(expect.stringContaining(`write state: ${state}`));
  expect(JSON.stringify(renderLine.mock.calls)).not.toContain('fresh-test');
  expect(JSON.stringify(renderLine.mock.calls)).not.toContain('rotated-test');
});

it('saves a started rotation but does not send a cancelled manual summary', async () => {
  const controller = new AbortController();
  observeOAuthRenewal(fresh, () => { controller.abort(new Error('operation ended')); });
  const { deps } = runtime();
  await expect(deps.compactHistory!('summary-renewal', controller.signal)).rejects.toThrow('operation ended');
  expect(read().providerConnections?.[0]?.accountAuth?.openai).toMatchObject({ ...fresh, expiresAt: expect.any(Number) }); expect(received).toEqual([]);
});

it.each(['signal', 'admission'].flatMap(end => ['unknown', 'persisted'].map(state => ({ end, state }))))('keeps $state storage failure visible when manual summary $end ends', async ({ end, state }) => {
  const controller = new AbortController(); const { deps, context, renderLine } = runtime();
  observeOAuthRenewal(fresh, () => {
    if (end === 'signal') controller.abort(new Error('operation ended'));
    else context.session.id = 'another-session';
  });
  if (state === 'unknown') vi.spyOn(store, 'writeTextFileAtomic').mockImplementation(() => {});
  else {
    const persist = persistence.persistConfigEdit;
    vi.spyOn(persistence, 'persistConfigEdit').mockImplementation((...args) => {
      const result = persist(...args); write({ ...read(), activeProviderConnectionId: 'changed' }); return result;
    });
  }
  await expect(deps.compactHistory!('summary-renewal', controller.signal)).resolves.toMatchObject({
    status: 'failed', reason: expect.stringContaining(`write state: ${state}`),
  });
  expect(renderLine).not.toHaveBeenCalled(); expect(received).toEqual([]);
});

it('refuses cache refresh without renewing or publishing a native account', async () => {
  const renewal = observeOAuthRenewal(fresh);
  const { deps, context, renderLine } = runtime(); const publication = context.configuration.current;
  expect(await refresh(deps)).toBeUndefined();
  expect(renewal).not.toHaveBeenCalled(); expect(read().providerConnections?.[0]?.accountAuth?.openai).toEqual(old);
  expect(context.configuration.current).toBe(publication); expect(received).toEqual([]);
  expect(renderLine).not.toHaveBeenCalled();
});
