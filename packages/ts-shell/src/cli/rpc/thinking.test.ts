import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath } from '../../config/runtimeConfig.js';
import { readConfigSnapshot } from '../../config/document.js';
import { registerCatalogContribution } from '../../core/catalog/contributions.js';
import { userCatalogPath } from '../../core/models/catalogStore.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../../core/shell/runtimeContext.js';
import { SessionManager } from '../../session/SessionManager.js';
import { readSessionModel } from '../../session/model/state.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { SubmissionQueue } from '../interactive/inputQueue.js';
import { createRuntimeRpcHost } from './runtimeHost.js';
import { handleRpcCommand } from './rpcServer.js';

let root: string;
const retire: Array<() => void> = [];
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/rpc-thinking-');
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root); vi.stubEnv('OPENAI_API_KEY', '');
  fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
  fs.writeFileSync(getUserRuntimeConfigPath(), JSON.stringify({ provider: 'openai', activeProviderConnectionId: 'relay',
    providerConnections: [{ id: 'relay', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-key',
      baseUrl: 'https://rpc.example.invalid/v1', model: 'shared', thinkingEffort: null, status: 'connected',
      createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }));
});
afterEach(() => {
  retire.splice(0).forEach(close => close()); vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function fixture(model: Record<string, unknown> = {}, endpoint?: string) {
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: {
    relay: { label: 'Relay', runtime: 'openai', auth: 'api-key', baseUrl: 'https://rpc.example.invalid/v1', endpoint,
      models: [{ id: 'shared', contextWindow: 128000, maxTokens: 16000, ...model }] },
    other: { label: 'Other', runtime: 'openai', auth: 'api-key', baseUrl: 'https://other.example.invalid/v1',
      models: [{ id: 'shared', reasoning: true, thinkingLevelMap: { minimal: 'minimal', xhigh: 'xhigh', max: 'max' } }] },
  } }));
  const manager = new SessionManager(), session = manager.createNew(root);
  const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct',
    targetPathBase: root, gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true },
    session, runtimeConfig: getRuntimeConfig(root) });
  const host = { ...createRuntimeRpcHost({ runtimeContext: context, sessionManager: manager,
    sessionRuntime: { commands: new ShellCommandRuntime(), getState: () => 'idle' } as ShellSessionRuntime,
    queue: new SubmissionQueue(() => context.session, () => {}), isStreaming: () => false, enqueuePrompt: () => {} }),
    emitResponse: () => {} };
  return { context, host, manager };
}

it('discovers only automatic effort for a reasoning-disabled endpoint and cycling is a no-op', async () => {
  const { host, context } = fixture({ reasoning: false });
  expect((await handleRpcCommand({ type: 'get_available_thinking_levels' }, host)).data)
    .toMatchObject({ levels: ['off'], unverifiedLevels: [] });
  expect(await handleRpcCommand({ type: 'cycle_thinking_level' }, host))
    .toMatchObject({ success: true, data: { level: null } });
  expect(readSessionModel(context.session.id)).toBeUndefined();
});

it('cycles the selected endpoint map through automatic effort and persists the exact sequence', async () => {
  const { host, context } = fixture({ reasoning: true,
    thinkingLevelMap: { low: null, medium: null, high: 'deep', max: 'maximum' } });
  expect((await handleRpcCommand({ type: 'get_available_thinking_levels' }, host)).data)
    .toMatchObject({ levels: ['high', 'max', 'off'], unverifiedLevels: [] });
  for (const level of ['high', 'max', 'auto', 'high']) {
    expect(await handleRpcCommand({ type: 'cycle_thinking_level' }, host))
      .toMatchObject({ success: true, data: { level } });
    expect(readSessionModel(context.session.id)?.thinkingEffort).toBe(level === 'auto' ? null : level);
    expect((await handleRpcCommand({ type: 'get_state' }, host)).data?.thinkingLevel).toBe(level);
  }
});

it('retains locally admissible legacy levels as unverified and preserves the setter notice', async () => {
  const { host } = fixture();
  expect((await handleRpcCommand({ type: 'get_available_thinking_levels' }, host)).data)
    .toMatchObject({ levels: ['low', 'medium', 'high', 'off'], unverifiedLevels: ['low', 'medium', 'high'] });
  expect(await handleRpcCommand({ type: 'set_thinking_level', level: 'low' }, host))
    .toMatchObject({ success: true, data: { level: 'low', note: expect.stringContaining('unverified') } });
});

it('publishes the saved effort to the same running host before the next cycle', async () => {
  const { host, context } = fixture({ reasoning: true, thinkingLevelMap: { low: null, medium: null, max: 'maximum' } });
  expect(await handleRpcCommand({ type: 'set_thinking_level', level: 'high' }, host))
    .toMatchObject({ success: true, data: { level: 'high' } });
  expect(readSessionModel(context.session.id)?.thinkingEffort).toBe('high');
  expect(await handleRpcCommand({ type: 'cycle_thinking_level' }, host))
    .toMatchObject({ success: true, data: { level: 'max' } });
});

it('does not cycle into explicit effort when the endpoint output budget cannot support it', async () => {
  const file = getUserRuntimeConfigPath(); const settings = readConfigSnapshot(file)!.values;
  fs.writeFileSync(file, JSON.stringify({ ...settings, maxOutputTokens: 1024 }));
  const { host, context } = fixture({ reasoning: true }, 'anthropic-messages');
  expect(context.configuration.current.admissionBlocked).toBe(false);
  expect(await handleRpcCommand({ type: 'set_thinking_level', level: 'low' }, host))
    .toMatchObject({ success: false, error: expect.stringContaining('at least 2048') });
  expect((await handleRpcCommand({ type: 'get_available_thinking_levels' }, host)).data)
    .toMatchObject({ levels: ['off'], unverifiedLevels: [] });
  expect(await handleRpcCommand({ type: 'cycle_thinking_level' }, host))
    .toMatchObject({ success: true, data: { level: null } });
  expect(readSessionModel(context.session.id)).toBeUndefined();
});

it.each(['off', 'auto', 'none'])('keeps %s as a provider-decides alias and refuses explicit unsupported effort without a write', async alias => {
  const { host, context } = fixture({ reasoning: false });
  const file = fs.readFileSync(getUserRuntimeConfigPath());
  expect(await handleRpcCommand({ type: 'set_thinking_level', level: alias }, host))
    .toMatchObject({ success: true, data: { level: 'auto' } });
  const saved = readSessionModel(context.session.id);
  expect(saved?.thinkingEffort).toBeNull();
  expect(await handleRpcCommand({ type: 'set_thinking_level', level: 'max' }, host)).toMatchObject({ success: false });
  expect(readSessionModel(context.session.id)).toEqual(saved);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(file);
});

it('discovers virtual levels without routing, then refuses a retired registration without physical fallback', async () => {
  const { host, context } = fixture({ reasoning: false });
  const route = vi.fn(() => ({ provider: 'openai', modelId: 'shared' }));
  const close = registerCatalogContribution({ root, sessionId: context.session.id, commands: [], tools: [], skills: () => [],
    virtualModels: [{ provider: 'adaptive', id: 'auto', name: 'Adaptive', thinkingLevels: ['high', 'max'], route }] });
  retire.push(close);
  expect((await handleRpcCommand({ type: 'set_model', provider: 'adaptive', modelId: 'auto' }, host)).success).toBe(true);
  expect((await handleRpcCommand({ type: 'get_available_thinking_levels' }, host)).data)
    .toMatchObject({ levels: ['high', 'max', 'off'], unverifiedLevels: [] });
  expect(await handleRpcCommand({ type: 'cycle_thinking_level' }, host)).toMatchObject({ success: true, data: { level: 'high' } });
  const saved = readSessionModel(context.session.id);
  close();
  expect(await handleRpcCommand({ type: 'get_available_thinking_levels' }, host)).toMatchObject({ success: false });
  expect(await handleRpcCommand({ type: 'cycle_thinking_level' }, host)).toMatchObject({ success: false });
  expect(readSessionModel(context.session.id)).toEqual(saved); expect(route).not.toHaveBeenCalled();
});

it('keeps virtual effort discovery independent of unavailable dormant physical credentials', async () => {
  const { host, context } = fixture({ reasoning: false });
  const route = vi.fn(() => ({ provider: 'openai', modelId: 'shared' }));
  retire.push(registerCatalogContribution({ root, sessionId: context.session.id, commands: [], tools: [], skills: () => [],
    virtualModels: [{ provider: 'adaptive', id: 'auto', name: 'Adaptive', route }] }));
  expect((await handleRpcCommand({ type: 'set_model', provider: 'adaptive', modelId: 'auto' }, host)).success).toBe(true);
  fs.writeFileSync(getUserRuntimeConfigPath(), '{"provider":"openai"}');
  expect(refreshShellRuntimeConfig(context).status).toBe('applied');
  expect((await handleRpcCommand({ type: 'get_available_thinking_levels' }, host)).data)
    .toMatchObject({ levels: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'off'], unverifiedLevels: [] });
  expect(await handleRpcCommand({ type: 'cycle_thinking_level' }, host))
    .toMatchObject({ success: true, data: { level: 'minimal' } });
  expect(route).not.toHaveBeenCalled();
});
