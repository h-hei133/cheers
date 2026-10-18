import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, type RuntimeConfigFile } from '../config/runtimeConfig.js';
import { resolveProviderCredential } from '../core/shell/providerCredentials.js';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import * as authorization from '../provider/request/authorization.js';
import * as transport from '../provider/request/fetch.js';
import * as store from '../session/store/sessionFileStore.js';
import { runCliRuntimeInvocation, type CliRuntimeInvocationInput, type CliRuntimeInvocationRequest } from './cliRuntimeInvocation.js';
import { createProviderReadinessCliTerminalEvent } from './providerReadinessCliSurface.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import { delegatedSteps } from '../cli/provider/step.js';
import { readRefreshLease, refreshLineage } from '../core/auth/account/lease.js';

let home: string;
let root: string;
let file: string;
const old = { type: 'openai-chatgpt-account' as const, accessToken: 'old-test', refreshToken: 'refresh-test', expiresAt: 1, accountId: 'a' };
const fresh = { ...old, accessToken: 'fresh-test', refreshToken: 'rotated-test', expiresAt: Date.now() + 3600000 };
function write(value: RuntimeConfigFile) { fs.writeFileSync(file, JSON.stringify(value)); }
function read(): RuntimeConfigFile { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function nativeExchange(change: () => void = () => {}) {
  const exchange = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe('POST');
    expect(new URLSearchParams(String(init?.body)).get('grant_type')).toBe('refresh_token');
    expect(readRefreshLease(refreshLineage({ provider: 'openai', refreshToken: old.refreshToken }))?.phase).toBe('dispatched');
    change();
    return new Response(JSON.stringify({ access_token: fresh.accessToken, refresh_token: fresh.refreshToken, expires_in: 3600 }),
      { headers: { 'Content-Type': 'application/json' } });
  });
  vi.spyOn(transport, 'providerFetchFromTimeouts').mockReturnValue(exchange as typeof fetch);
  return exchange;
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(fresh.expiresAt - 3600000);
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'invocation-renewal-')); root = path.join(home, 'workspace');
  fs.mkdirSync(root); fs.mkdirSync(path.join(home, '.cheers')); file = path.join(home, '.cheers', 'config.json');
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  write({ provider: 'openai', activeProviderConnectionId: 'a', providerConnections: [{ id: 'a', provider: 'openai',
    authType: 'account-auth', accountAuth: { openai: old }, model: 'probe', status: 'connected' }] });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

function request(): CliRuntimeInvocationInput {
  return { sessionId: 'renewal-integration', prompt: 'hello', workspaceRoot: root,
    signal: new AbortController().signal, maxTurns: 1, agentMode: 'plan', skillOptions: { noSkills: true }, providerModeEnv: 'real',
    providerCredentialResolution: resolveProviderCredential({ runtimeConfig: getRuntimeConfig(root), env: {} }),
    escalationPromptHandler: async prompt => ({ promptId: prompt.id, decision: 'deny', respondedAt: 1 }),
  };
}
function dependencies() {
  return {
    checkProviderReadiness: vi.fn(async () => ({ ok: true as const })),
    createReadinessTerminalEvent: createProviderReadinessCliTerminalEvent,
    createStep: vi.fn((_request: CliRuntimeInvocationRequest) => async () => ({ text: 'ready', toolCalls: [], stopReason: 'stop' })),
    tools: () => new Map(), hooks: new HookDispatcher(),
  };
}
async function collect(events: AsyncIterable<QueryEvent>) {
  const result: QueryEvent[] = []; for await (const event of events) result.push(event); return result;
}

it('confirms scoped storage before publishing, readiness, dependent resources and the step', async () => {
  const exchange = nativeExchange();
  const deps = dependencies(); const order: string[] = [];
  const checkStored = () => expect(read().providerConnections?.[0]?.accountAuth?.openai).toEqual(fresh);
  deps.checkProviderReadiness.mockImplementation(async () => { checkStored(); order.push('readiness'); return { ok: true }; });
  const published = vi.fn(() => { checkStored(); order.push('published'); });
  const resources = vi.fn(() => { checkStored(); order.push('resources'); return {}; });
  const run = await runCliRuntimeInvocation({ ...request(), onCredentialPersisted: published, prepareProviderResources: resources }, deps);
  expect((await collect(run.events)).at(-1)).toMatchObject({ type: 'query.completed', result: { status: 'completed' } });
  expect(order).toEqual(['published', 'readiness', 'resources']);
  expect(deps.checkProviderReadiness).toHaveBeenCalledWith(expect.objectContaining({ accountAuth: fresh }));
  expect(deps.createStep).toHaveBeenCalledOnce();
  expect(deps.createStep.mock.calls[0]![0].providerCredentialResolution.credential?.accountAuth).toEqual(fresh);
  expect(exchange).toHaveBeenCalledOnce();
});

it('carries verified main renewal into an explicit named role without a second refresh', async () => {
  const exchange = nativeExchange();
  const config = getRuntimeConfig(root); const deps = dependencies();
  deps.createStep.mockImplementation(captured => async () => {
    await delegatedSteps(captured, new Map(), {}).prepare({ connectionId: 'a', provider: 'openai', model: 'gpt-5.2' });
    return { text: 'Prepared same account', toolCalls: [], stopReason: 'stop' };
  });
  const run = await runCliRuntimeInvocation({ ...request(), runtimeConfig: config }, deps);
  expect((await collect(run.events)).at(-1)).toMatchObject({ type: 'query.completed', result: { status: 'completed' } });
  expect(exchange).toHaveBeenCalledOnce();
  expect(config.providerConnections[0]?.accountAuth?.openai).toEqual(old);
  expect(deps.createStep.mock.calls[0]![0].runtimeConfig?.providerConnections[0]?.accountAuth?.openai).toEqual(fresh);
});

it.each(['relogin', 'delete', 'suppressed'])('prevents readiness and dispatch after %s persistence rejection', async kind => {
  const exchange = nativeExchange(() => {
    if (kind === 'relogin') write({ ...read(), providerConnections: [{ ...read().providerConnections![0]!,
      accountAuth: { openai: { ...old, accessToken: 'another-login', refreshToken: 'another-refresh' } } }] });
    if (kind === 'delete') write({ provider: 'openai' });
  });
  if (kind === 'suppressed') vi.spyOn(store, 'writeTextFileAtomic').mockImplementation(() => {});
  const deps = dependencies(); const published = vi.fn(); const resources = vi.fn(() => ({}));
  const run = await runCliRuntimeInvocation({ ...request(), onCredentialPersisted: published, prepareProviderResources: resources }, deps);
  const events = await collect(run.events); const output = JSON.stringify(events);
  expect(deps.checkProviderReadiness).not.toHaveBeenCalled(); expect(deps.createStep).not.toHaveBeenCalled();
  expect(published).not.toHaveBeenCalled(); expect(resources).not.toHaveBeenCalled();
  expect(output).toContain(`write state: ${kind === 'suppressed' ? 'unknown' : 'unchanged'}`);
  expect(output).not.toContain('fresh-test'); expect(output).not.toContain('rotated-test');
  expect(exchange).toHaveBeenCalledOnce();
});

it.each(['admission', 'signal'])('saves a started rotation but prevents readiness when %s ends', async kind => {
  const controller = new AbortController(); let ended = false;
  const exchange = nativeExchange(() => {
    if (kind === 'signal') controller.abort(new Error('operation ended')); else ended = true;
  });
  const deps = dependencies(); const published = vi.fn();
  const run = await runCliRuntimeInvocation({ ...request(), signal: controller.signal,
    admission: () => ended ? 'operation ended' : undefined, onCredentialPersisted: published }, deps);
  await expect(collect(run.events)).rejects.toThrow('operation ended');
  expect(read().providerConnections?.[0]?.accountAuth?.openai).toEqual(fresh); expect(published).toHaveBeenCalledOnce();
  expect(deps.checkProviderReadiness).not.toHaveBeenCalled(); expect(deps.createStep).not.toHaveBeenCalled();
  expect(exchange).toHaveBeenCalledOnce();
});

it('refuses fabricated renewal output before storage, publication and readiness', async () => {
  vi.spyOn(authorization, 'renewAccountAuthIfExpiring').mockResolvedValue({ renewed: true, accountAuth: fresh });
  const exchange = nativeExchange(); const before = fs.readFileSync(file);
  const deps = dependencies(); const published = vi.fn(); const resources = vi.fn(() => ({}));
  const run = await runCliRuntimeInvocation({ ...request(), onCredentialPersisted: published, prepareProviderResources: resources }, deps);
  const output = JSON.stringify(await collect(run.events));
  expect(output).toContain('native response was not verified');
  expect(output).not.toContain(fresh.accessToken); expect(output).not.toContain(fresh.refreshToken);
  expect(fs.readFileSync(file)).toEqual(before); expect(exchange).not.toHaveBeenCalled();
  expect(published).not.toHaveBeenCalled(); expect(resources).not.toHaveBeenCalled();
  expect(deps.checkProviderReadiness).not.toHaveBeenCalled(); expect(deps.createStep).not.toHaveBeenCalled();
});
