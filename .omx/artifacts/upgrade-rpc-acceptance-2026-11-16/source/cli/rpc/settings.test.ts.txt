import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getProjectConfigPath, getRuntimeConfig, getUserRuntimeConfigPath, type RuntimeConfigOverrides } from '../../config/runtimeConfig.js';
import * as configFiles from '../../config/runtimeConfig.js';
import { ConfigWriteError } from '../../config/outcome.js';
import { createConfigInputs } from '../../config/inputs/selection.js';
import type { ConfigInputs } from '../../config/inputs/model.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { SessionManager } from '../../session/SessionManager.js';
import { SubmissionQueue } from '../interactive/inputQueue.js';
import { createRuntimeRpcHost } from './runtimeHost.js';
import { handleRpcCommand } from './rpcServer.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/rpc-settings-');
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true }); fs.writeFileSync(getUserRuntimeConfigPath(), '{}');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function fixture(overrides?: RuntimeConfigOverrides, id?: string, inputs?: ConfigInputs) {
  const manager = new SessionManager(), session = id ? manager.getSession(id)! : manager.createNew(root);
  const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct',
    targetPathBase: root, gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true }, session,
    runtimeConfig: getRuntimeConfig(root, overrides, inputs), runtimeConfigOverrides: overrides });
  const host = { ...createRuntimeRpcHost({ runtimeContext: context, sessionManager: manager,
    sessionRuntime: { commands: new ShellCommandRuntime(), getState: () => 'idle' } as ShellSessionRuntime,
    queue: new SubmissionQueue(() => context.session, () => {}), isStreaming: () => false, enqueuePrompt: () => {} }),
    emitResponse: () => {} };
  return { context, host };
}

it.each(['compaction', 'retry'] as const)('returns verified stored and effective auto-%s values and preserves them on reopen', async kind => {
  const { context, host } = fixture();
  const type = kind === 'compaction' ? 'set_auto_compaction' : 'set_auto_retry';
  const key = kind === 'compaction' ? 'compactionEnabled' : 'retryEnabled';
  for (const enabled of [false, true]) {
    expect(await handleRpcCommand({ type, enabled }, host)).toMatchObject({ success: true,
      data: { saved: true, effective: enabled, stored: enabled, applied: true, application: 'next operation',
        note: expect.stringContaining('Saved to your user configuration.') } });
    expect(context.runtimeConfig[key]).toBe(enabled);
    expect(fixture(undefined, context.session.id).context.runtimeConfig[key]).toBe(enabled);
  }
});

it('reports the launch override when a saved auto-compaction choice is not effective', async () => {
  const { context, host } = fixture({ compactionEnabled: true });
  expect(context.runtimeConfig.compactionEnabled).toBe(true);
  expect(await handleRpcCommand({ type: 'set_auto_compaction', enabled: false }, host)).toMatchObject({ success: true,
    data: { saved: true, stored: false, effective: true, applied: false, source: expect.stringContaining('override'),
      note: expect.stringContaining('launch override') } });
  expect((await handleRpcCommand({ type: 'get_state' }, host)).data?.autoCompactionEnabled).toBe(true);
  expect(fixture(undefined, context.session.id).context.runtimeConfig.compactionEnabled).toBe(false);
});

it('reports the accepted user retry default over the existing project value without rewriting that file', async () => {
  const project = getProjectConfigPath(root); fs.mkdirSync(path.dirname(project), { recursive: true });
  fs.writeFileSync(project, JSON.stringify({ retryEnabled: false }));
  const { context, host } = fixture(); expect(context.runtimeConfig.retryEnabled).toBe(false);
  const before = fs.readFileSync(project);
  expect(await handleRpcCommand({ type: 'set_auto_retry', enabled: true }, host)).toMatchObject({ success: true,
    data: { saved: true, stored: true, effective: true, applied: true, source: expect.stringContaining('user') } });
  expect((await handleRpcCommand({ type: 'get_state' }, host)).data?.autoRetryEnabled).toBe(true);
  expect(fs.readFileSync(project)).toEqual(before);
});

it('reports an explicit read-only retry input that still overrides a saved personal default', async () => {
  const input = path.join(root, 'overlay.json'); fs.writeFileSync(input, '{"retryEnabled":false}');
  const selected = createConfigInputs([{ path: input, source: 'user' }], root);
  const { context, host } = fixture(undefined, undefined, selected); expect(context.runtimeConfig.retryEnabled).toBe(false);
  const before = fs.readFileSync(input);
  expect(await handleRpcCommand({ type: 'set_auto_retry', enabled: true }, host)).toMatchObject({ success: true,
    data: { saved: true, stored: true, effective: false, applied: false, source: expect.stringContaining('input 1') } });
  expect((await handleRpcCommand({ type: 'get_state' }, host)).data?.autoRetryEnabled).toBe(false);
  expect(fs.readFileSync(input)).toEqual(before);
  expect(fixture(undefined, context.session.id).context.runtimeConfig.retryEnabled).toBe(true);
});

it('keeps an unverified setting write unsuccessful without refreshing the accepted state', async () => {
  const { context, host } = fixture(); const before = fs.readFileSync(getUserRuntimeConfigPath());
  const value = context.runtimeConfig.retryEnabled;
  vi.spyOn(configFiles, 'writeRuntimeConfigFileAt').mockImplementation(() => { throw new ConfigWriteError('verification-failed', 'unknown'); });
  expect(await handleRpcCommand({ type: 'set_auto_retry', enabled: !value }, host)).toMatchObject({ success: false });
  expect(context.runtimeConfig.retryEnabled).toBe(value); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
});
