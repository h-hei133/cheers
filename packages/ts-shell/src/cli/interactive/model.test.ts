import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InteractiveMode } from './interactiveMode.js';
import { createShellRuntimeContext, switchActiveSession } from '../../core/shell/runtimeContext.js';
import { getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { SessionManager } from '../../session/SessionManager.js';
import { readSessionModel } from '../../session/model/state.js';
import { defaultHookDispatcher } from '../../core/hooks/hookDispatcher.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { StructuredLogger } from '../../observability/structuredLogger.js';
import type { ApprovalTrustPolicy } from '../../core/shell/approvalTrustPolicy.js';
import type { CliMcpGateway } from '../../entrypoints/cliMcpModule.js';
import { pickerFor, type PickerHost } from './picker/registry.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { RecordingTerminal } from '../../test-utils/terminalDouble.js';
import { writeCatalogCache } from '../../core/models/catalogStore.js';

let root: string;
let mode: InteractiveMode | undefined;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'model-picker-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: 'fixture', providerConnections: [{
    id: 'fixture', provider: 'openai', authType: 'api-key', apiKey: 'SYNTHETIC_KEY', model: 'base', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'gpt-5.4' }] }]);
});
afterEach(() => { mode?.stop(); mode = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('binds the real model picker to its opening session and project across a delayed hook', async () => {
  const manager = new SessionManager(); const first = manager.createNew(root); const second = manager.createNew(root);
  const cwd = path.join(root, 'nested'); fs.mkdirSync(cwd);
  const context = createShellRuntimeContext({ cwd, originalCwd: cwd, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root), session: first });
  mode = new InteractiveMode({ runtimeContext: context,
    sessionRuntime: { observeEvents: () => () => {}, getAgentMode: () => 'build', getPermissionScope: () => 'ask', getCurrentRunController: () => null } as unknown as ShellSessionRuntime,
    sessionManager: manager, renderer: new StreamingRenderer(), terminal: new RecordingTerminal(), setReadline: () => {},
    logger: { info: () => {}, warn: () => {}, error: () => {} } as unknown as StructuredLogger,
    approvalTrustPolicy: {} as ApprovalTrustPolicy, initialMcpGateway: {} as CliMcpGateway,
  });
  mode.start();
  const host = (mode as unknown as { pickerHost(): PickerHost }).pickerHost();
  expect(host.commandContext.projectRoot).toBe(root);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const hook = vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PreModelSwitch') { expect(event.workspaceRoot).toBe(root); await gate; }
    return undefined;
  });
  const picker = pickerFor('/model', host)!;
  const target = (await picker.load()).find(row => row.label === 'gpt-5.4');
  expect(target).toBeDefined(); expect(target?.disabled).not.toBe(true);
  const original = fs.readFileSync(getUserRuntimeConfigPath());
  const pending = picker.apply([target!.id]);
  await vi.waitFor(() => expect(hook).toHaveBeenCalledOnce());
  switchActiveSession(context, second); const revision = context.configuration.current.revision;
  release(); const result = await pending;
  expect(result?.note).toContain('admission changed');
  expect(readSessionModel(first.id)).toBeUndefined(); expect(readSessionModel(second.id)).toBeUndefined();
  expect(context.configuration.current.revision).toBe(revision);
  expect(hook.mock.calls.some(([event]) => event.eventName === 'PostModelSwitch')).toBe(false);
  expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
});
