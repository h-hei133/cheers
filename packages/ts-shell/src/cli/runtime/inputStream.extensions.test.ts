import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { catalogContributions } from '../../core/catalog/contributions.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import { initialConfiguration } from '../../core/shell/configuration.js';
import * as outputGuard from '../../core/shell/outputGuard.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { SessionManager } from '../../session/SessionManager.js';
import type { RpcExtensionUiRequest, RpcResponse, RpcUiBridge } from '../rpc/protocol.js';
import { closeExtensionsFor, installExtensionRuntime, waitForExtensionsFor } from './extensions.js';
import { runPromptInputStream } from './inputStream.js';

let directory: string;
let context: ShellRuntimeContext;
let runtime: ShellSessionRuntime;
let manager: SessionManager;
let frames: RpcExtensionUiRequest[];
let responses: RpcResponse[];
const inputs: PassThrough[] = [];

beforeEach(() => {
  const temporaryRoot = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  directory = fs.mkdtempSync(path.join(temporaryRoot, 'rpc-extension-'));
  const home = path.join(directory, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', directory);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', directory);
  vi.stubEnv('CHEERS_MARKETPLACES_FILE', path.join(directory, 'sources.json'));
  vi.stubEnv('CHEERS_EXTENSIONS_FILE', path.join(directory, 'registry.json'));
  manager = new SessionManager();
  const session = manager.createNewWithId('sess_rpc_extension', directory);
  const seed = { cwd: directory, originalCwd: directory, projectRoot: directory, session,
    runtimeConfig: getRuntimeConfig(directory) };
  context = { ...seed, configuration: initialConfiguration(seed) } as ShellRuntimeContext;
  runtime = { commands: new ShellCommandRuntime(), getPermissionScope: () => 'ask', waitForIdle: async () => {},
    cancelCurrentRun: () => {} } as unknown as ShellSessionRuntime;
  frames = [];
  responses = [];
  vi.spyOn(outputGuard, 'writeRawStdout').mockImplementation(text => {
    const frame = JSON.parse(text);
    if (frame.type === 'extension_ui_request') frames.push(frame);
    else if (frame.type === 'response') responses.push(frame);
  });
});

afterEach(async () => {
  for (const input of inputs.splice(0)) input.destroy();
  await closeExtensionsFor(context);
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function installDialog() {
  const file = path.join(directory, 'dialog.ts');
  fs.writeFileSync(file, `export default api => {
    api.registerCommand({ name: 'dialog', kind: 'local', summary: 'Dialog', group: 'session', supportsNonInteractive: true,
      execute: async args => {
        let value;
        if (args[0] === 'confirm') value = await api.ui.confirm('Confirm action', 'Proceed?');
        else if (args[0] === 'input') value = await api.ui.input('Enter value', 'placeholder');
        else if (args[0] === 'editor') value = await api.ui.editor('Edit value', 'prefill', { timeout: 10000 });
        else value = await api.ui.select('Choose value', ['safe', 'fast']);
        api.ui.notify('dialog settled');
        return { kind: 'local', output: value === undefined ? 'cancelled' : String(value) };
      }
    });
  };`);
  context.cliExtensionPaths = [file];
  installExtensionRuntime(context, runtime, () => ({ sessionId: context.session.id, workspaceRoot: directory,
    hooks: new HookDispatcher(), emit: () => {}, permissionScope: 'ask' }));
  return currentDialog();
}

async function currentDialog() {
  await waitForExtensionsFor(context);
  const command = catalogContributions(directory, context.session.id).flatMap(entry => entry.commands)
    .find(candidate => candidate.name === 'dialog');
  if (!command) throw new Error('Loaded dialog command is missing.');
  return command;
}

function start(runPrompt: (prompt: string) => Promise<'exit' | void>, onRpcUiBridge?: (bridge: RpcUiBridge) => void) {
  const stdin = new PassThrough(); inputs.push(stdin);
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never,
    rpcMode: true, runPrompt, onRpcUiBridge });
  return { stdin, run };
}

it.each(['select', 'confirm', 'input', 'editor'])('routes a loaded extension %s dialog and its JSONL response through the real input consumer', async method => {
  const command = await installDialog();
  const outputs: string[] = [];
  let bridge: RpcUiBridge | undefined;
  const { stdin, run } = start(async prompt => {
    const result = await command.execute([prompt.split(' ')[1]!], { cwd: directory, projectRoot: directory,
      sessionId: context.session.id } as never);
    if (result.kind === 'local') outputs.push(result.output);
  }, value => { bridge = value; });
  stdin.write(JSON.stringify({ type: 'prompt', message: `/dialog ${method}` }) + '\n');
  await vi.waitFor(() => expect(frames.find(frame => frame.method === method)).toBeDefined());
  const request = frames.find(frame => frame.method === method)!;
  expect(bridge?.pendingCount()).toBe(1);
  stdin.write(JSON.stringify({ type: 'extension_ui_response', id: request.id,
    ...(method === 'confirm' ? { confirmed: true } : { value: method === 'select' ? 'safe' : 'edited' }) }) + '\n');
  await vi.waitFor(() => expect(outputs).toEqual([method === 'confirm' ? 'true' : method === 'select' ? 'safe' : 'edited']));
  expect(frames.some(frame => frame.method === 'notify')).toBe(true);
  stdin.end(); await run;
  expect(bridge?.pendingCount()).toBe(0);
});

it.each(['set_auto_retry', 'set_auto_compaction'] as const)('admits a fresh loaded-extension dialog after successful JSONL %s and isolates the cancelled request', async type => {
  await installDialog();
  const outputs: string[] = [];
  let bridge: RpcUiBridge | undefined;
  const { stdin, run } = start(async prompt => {
    const command = await currentDialog();
    const result = await command.execute([prompt.split(' ')[1]!], { cwd: directory, projectRoot: directory,
      sessionId: context.session.id } as never);
    if (result.kind === 'local') outputs.push(result.output);
  }, value => { bridge = value; });
  try {
    stdin.write('/dialog editor\n');
    await vi.waitFor(() => expect(frames.filter(frame => frame.method === 'editor')).toHaveLength(1));
    const oldRequest = frames.find(frame => frame.method === 'editor')!;
    const background = context.configuration.backgroundSignal;
    const key = type === 'set_auto_retry' ? 'retryEnabled' : 'compactionEnabled';
    const enabled = context.configuration.current.config[key] !== true;
    stdin.write(JSON.stringify({ id: 'setting', type, enabled }) + '\n');
    await vi.waitFor(() => expect(responses.find(frame => frame.id === 'setting')).toMatchObject({ success: true }));
    expect(background.aborted).toBe(true);
    expect(context.configuration.current.config[key]).toBe(enabled);
    await vi.waitFor(() => expect(outputs).toEqual(['cancelled']));
    stdin.write('/dialog select\n');
    await vi.waitFor(() => expect(frames.filter(frame => frame.method === 'select')).toHaveLength(1));
    const request = frames.find(frame => frame.method === 'select')!;
    expect(request.id).not.toBe(oldRequest.id);
    stdin.write(JSON.stringify({ type: 'extension_ui_response', id: oldRequest.id, value: 'fast' }) + '\n');
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(bridge?.pendingCount()).toBe(1);
    expect(outputs).toEqual(['cancelled']);
    stdin.write(JSON.stringify({ type: 'extension_ui_response', id: request.id, value: 'safe' }) + '\n');
    await vi.waitFor(() => expect(outputs).toEqual(['cancelled', 'safe']));
  } finally { stdin.end(); await run; }
  expect(bridge?.pendingCount()).toBe(0);
});

it.each(['new_session', 'switch_session'] as const)('admits current-session extension UI after successful JSONL %s and refuses the old answer', async type => {
  const oldCommand = await installDialog();
  const originalSession = context.session.id;
  const target = type === 'switch_session' ? manager.createNew(directory, { activate: false }) : undefined;
  const outputs: string[] = [];
  let bridge: RpcUiBridge | undefined;
  const { stdin, run } = start(async prompt => {
    const command = await currentDialog();
    const result = await command.execute([prompt.split(' ')[1]!], { cwd: directory, projectRoot: directory,
      sessionId: context.session.id } as never);
    if (result.kind === 'local') outputs.push(result.output);
  }, value => { bridge = value; });
  const oldOutcome = oldCommand.execute(['editor'], { cwd: directory, projectRoot: directory,
    sessionId: originalSession } as never).then(result => result.kind === 'local' ? result.output : 'unexpected', () => 'retired');
  try {
    await vi.waitFor(() => expect(frames.filter(frame => frame.method === 'editor')).toHaveLength(1));
    const oldRequest = frames.find(frame => frame.method === 'editor')!;
    const background = context.configuration.backgroundSignal;
    stdin.write(JSON.stringify({ id: 'session', type, ...(target ? { sessionPath: target.id } : {}) }) + '\n');
    await vi.waitFor(() => expect(responses.find(frame => frame.id === 'session')).toMatchObject({ success: true,
      data: { cancelled: false, sessionId: context.session.id } }));
    expect(context.session.id).not.toBe(originalSession);
    if (target) expect(context.session.id).toBe(target.id);
    expect(background.aborted).toBe(true);
    expect(await oldOutcome).toMatch(/^(?:cancelled|retired)$/);
    stdin.write('/dialog select\n');
    await vi.waitFor(() => expect(frames.filter(frame => frame.method === 'select')).toHaveLength(1));
    const request = frames.find(frame => frame.method === 'select')!;
    expect(request.id).not.toBe(oldRequest.id);
    stdin.write(JSON.stringify({ type: 'extension_ui_response', id: oldRequest.id, value: 'fast' }) + '\n');
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(bridge?.pendingCount()).toBe(1);
    expect(outputs).toEqual([]);
    stdin.write(JSON.stringify({ type: 'extension_ui_response', id: request.id, value: 'safe' }) + '\n');
    await vi.waitFor(() => expect(outputs).toEqual(['safe']));
  } finally { stdin.end(); await run; await oldOutcome; }
  expect(bridge?.pendingCount()).toBe(0);
});

it.each(['set_auto_retry', 'new_session'] as const)('keeps loaded-extension UI retired when JSONL %s settles after EOF', async type => {
  await installDialog();
  let bridge: RpcUiBridge | undefined;
  const { stdin, run } = start(async () => {}, value => { bridge = value; });
  stdin.end(JSON.stringify({ id: 'eof-change', type,
    ...(type === 'set_auto_retry' ? { enabled: context.configuration.current.config.retryEnabled !== true } : {}) })
    + '\n');
  await run;
  expect(responses.find(frame => frame.id === 'eof-change')).toMatchObject({ success: true });
  expect(frames).toEqual([]);
  expect(bridge?.pendingCount()).toBe(0);
  const command = await currentDialog();
  await expect(command.execute(['input'], { cwd: directory, projectRoot: directory,
    sessionId: context.session.id } as never)).resolves.toMatchObject({ kind: 'local', output: 'cancelled' });
  expect(frames).toEqual([]);
});

it.each(['turn', 'control'])('cancels a loaded extension editor on EOF before waiting for the %s chain to drain', async lane => {
  const command = await installDialog();
  const outputs: string[] = [];
  let bridge: RpcUiBridge | undefined;
  const { stdin, run } = start(async () => {
    const result = await command.execute(['editor'], { cwd: directory, projectRoot: directory,
      sessionId: context.session.id } as never);
    if (result.kind === 'local') outputs.push(result.output);
  }, value => { bridge = value; });
  stdin.write(lane === 'turn' ? '/dialog editor\n' : '/plugin list\n');
  await vi.waitFor(() => expect(frames.some(frame => frame.method === 'editor')).toBe(true));
  expect(bridge?.pendingCount()).toBe(1);
  const emitted = frames.length;
  stdin.end();
  await run;
  expect(outputs).toEqual(['cancelled']);
  expect(bridge?.pendingCount()).toBe(0);
  expect(frames).toHaveLength(emitted);
});

it('keeps queued extension dialogs cancelled when EOF arrives before their dispatch', async () => {
  const command = await installDialog();
  const outputs: string[] = [];
  let reachedIdle!: () => void; let releaseIdle!: () => void;
  const waitingForIdle = new Promise<void>(resolve => { reachedIdle = resolve; });
  const idleBarrier = new Promise<void>(resolve => { releaseIdle = resolve; });
  vi.spyOn(runtime, 'waitForIdle').mockImplementation(() => { reachedIdle(); return idleBarrier; });
  let bridge: RpcUiBridge | undefined;
  const { stdin, run } = start(async () => {
    const result = await command.execute(['input'], { cwd: directory, projectRoot: directory,
      sessionId: context.session.id } as never);
    if (result.kind === 'local') outputs.push(result.output);
  }, value => { bridge = value; });
  stdin.write('/dialog input\n');
  await waitingForIdle;
  const ended = new Promise<void>(resolve => { stdin.once('end', resolve); });
  stdin.end();
  await ended;
  releaseIdle();
  await run;
  expect(outputs).toEqual(['cancelled']);
  expect(bridge?.pendingCount()).toBe(0);
  expect(frames).toEqual([]);
});

it('cancels outstanding UI when a separate control requests exit', async () => {
  const command = await installDialog();
  const outputs: string[] = [];
  let bridge: RpcUiBridge | undefined;
  const { stdin, run } = start(async prompt => {
    if (prompt === '/plugin cancel') return 'exit';
    const result = await command.execute(['input'], { cwd: directory, projectRoot: directory,
      sessionId: context.session.id } as never);
    if (result.kind === 'local') outputs.push(result.output);
  }, value => { bridge = value; });
  stdin.write('/dialog input\n');
  await vi.waitFor(() => expect(frames.some(frame => frame.method === 'input')).toBe(true));
  stdin.write('/plugin cancel\n');
  await run;
  expect(outputs).toEqual(['cancelled']);
  expect(bridge?.pendingCount()).toBe(0);
});

it('isolates late answers and release callbacks when another input consumer replaces the UI binding', async () => {
  const command = await installDialog();
  const firstOutputs: string[] = []; const secondOutputs: string[] = [];
  let firstBridge: RpcUiBridge | undefined; let secondBridge: RpcUiBridge | undefined;
  const invoke = async (outputs: string[]) => {
    const result = await command.execute(['select'], { cwd: directory, projectRoot: directory,
      sessionId: context.session.id } as never);
    if (result.kind === 'local') outputs.push(result.output);
  };
  const first = start(() => invoke(firstOutputs), bridge => { firstBridge = bridge; });
  first.stdin.write('/dialog select\n');
  await vi.waitFor(() => expect(frames.filter(frame => frame.method === 'select')).toHaveLength(1));
  const oldRequest = frames.find(frame => frame.method === 'select')!;
  const second = start(() => invoke(secondOutputs), bridge => { secondBridge = bridge; });
  await vi.waitFor(() => expect(firstOutputs).toEqual(['cancelled']));
  expect(firstBridge?.pendingCount()).toBe(0);
  second.stdin.write('/dialog select\n');
  await vi.waitFor(() => expect(frames.filter(frame => frame.method === 'select')).toHaveLength(2));
  const newRequest = frames.filter(frame => frame.method === 'select')[1]!;
  second.stdin.write(JSON.stringify({ type: 'extension_ui_response', id: oldRequest.id, value: 'fast' }) + '\n');
  expect(secondBridge?.pendingCount()).toBe(1);
  first.stdin.end(); await first.run;
  expect(secondBridge?.pendingCount()).toBe(1);
  second.stdin.write(JSON.stringify({ type: 'extension_ui_response', id: newRequest.id, value: 'safe' }) + '\n');
  await vi.waitFor(() => expect(secondOutputs).toEqual(['safe']));
  second.stdin.end(); await second.run;
});

it('cleans up an RPC UI binding if the observer callback throws during setup', async () => {
  await installDialog();
  const pending = new PassThrough(); inputs.push(pending);
  let bridge: RpcUiBridge | undefined;
  await expect(runPromptInputStream({ stdin: pending, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    runPrompt: async () => {}, onRpcUiBridge: value => { bridge = value; throw new Error('observer failed'); } })).rejects.toThrow('observer failed');
  await expect(bridge!.input('retired')).resolves.toBeUndefined();
  expect(bridge?.pendingCount()).toBe(0);
  expect(frames).toEqual([]);
});
