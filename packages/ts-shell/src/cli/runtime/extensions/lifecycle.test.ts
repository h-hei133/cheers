import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as extensions from '../extensions.js';
import { bindExtensionUiFor, extensionHostFor } from './host.js';
import { catalogContributions, registerCatalogContribution } from '../../../core/catalog/contributions.js';
import { runEventHandlers } from '../../../extensions/events/dispatch.js';
import { initialConfiguration } from '../../../core/shell/configuration.js';
import { HookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import { ShellCommandRuntime } from '../../../core/shell/command.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';

let root: string;
let context: ShellRuntimeContext;
const cleanups: Array<() => void> = [];
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, 'extension-lifecycle-'));
  vi.stubEnv('HOME', path.join(root, 'home')); vi.stubEnv('USERPROFILE', path.join(root, 'home'));
  vi.stubEnv('CHEERS_MARKETPLACES_FILE', path.join(root, 'sources.json')); vi.stubEnv('CHEERS_EXTENSIONS_FILE', path.join(root, 'registry.json'));
  const seed = { cwd: root, projectRoot: root, session: { id: 'lifecycle', createdAt: '2026-11-19', projectRoot: root }, runtimeConfig: getRuntimeConfig(root) };
  context = { ...seed, configuration: initialConfiguration(seed) } as ShellRuntimeContext;
});
afterEach(async () => { cleanups.splice(0).forEach(release => release()); await extensions.closeExtensionsFor(context); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function install(cancelAndWait = vi.fn(async () => {})) {
  const runtime = { commands: new ShellCommandRuntime(), getPermissionScope: () => 'ask', input: () => undefined, cancelAndWait,
    executePrompt: vi.fn(async () => 'answer') } as unknown as ShellSessionRuntime;
  extensions.installExtensionRuntime(context, runtime, () => ({ sessionId: context.session.id, workspaceRoot: root, hooks: new HookDispatcher(), emit() {}, permissionScope: 'ask' }));
  return runtime;
}
type Start = (context: ShellRuntimeContext, reason?: string) => Promise<void>;
type Shutdown = (context: ShellRuntimeContext, reason?: string) => Promise<void>;
const start = (reason?: string) => {
  const fn = (extensions as unknown as { startExtensionsFor?: Start }).startExtensionsFor;
  expect(fn).toBeTypeOf('function'); return fn!(context, reason);
};
const shutdown = (reason?: string) => {
  const fn = (extensions as unknown as { shutdownExtensionsFor?: Shutdown }).shutdownExtensionsFor;
  expect(fn).toBeTypeOf('function'); return fn!(context, reason);
};
function contribution(handler: (event: string, payload: unknown, aliases?: readonly string[], signal?: AbortSignal) => Promise<unknown>, sessionId = context.session.id) {
  const retire = registerCatalogContribution({ root, sessionId, commands: [], tools: [], skills: () => [], onEvent: handler }); cleanups.push(retire); return retire;
}

it('starts the admitted CLI generation once after the complete file factory is ready', async () => {
  const file = path.join(root, 'extension.ts');
  fs.writeFileSync(file, `export default async api => { await Promise.resolve(); api.on('session_start', async event => { api.events.emit('started', event); }); };`);
  context.cliExtensionPaths = [file]; install();
  const observed: unknown[] = []; contribution(async (event, payload) => { if (event === 'session_start') observed.push(payload); });
  await start(); await start(); await extensions.waitForExtensionsFor(context);
  expect(observed).toEqual([{ type: 'session_start', sessionId: 'lifecycle', workspaceRoot: root, reason: 'startup' }]);
});

it('retires the original startup invocation on input cancellation and refuses its late host work', async () => {
  const controller = new AbortController(); install();
  let entered!: () => void, finish!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { finish = resolve; });
  let invocation: AbortSignal | undefined;
  contribution(async (event, _payload, _aliases, signal) => { if (event !== 'session_start') return; invocation = signal; entered(); await held; });
  const starting = extensions.startExtensionsFor(context, 'startup', controller.signal);
  const result = starting.then(() => ({ passed: true }), error => ({ error }));
  try {
    await reached; controller.abort(); await vi.waitFor(() => expect(invocation?.aborted).toBe(true));
    expect(await result).toHaveProperty('error');
  } finally { finish(); await result; }
});

it('quiesces the old host synchronously and joins the old run before shutdown then waits for every caller', async () => {
  let finishRun!: () => void; let finishNotification!: () => void; let notified!: () => void;
  const running = new Promise<void>(resolve => { finishRun = resolve; }); const notification = new Promise<void>(resolve => { finishNotification = resolve; });
  const reached = new Promise<void>(resolve => { notified = resolve; });
  const runtime = install(vi.fn(() => running)); const events: string[] = [];
  contribution(async event => { if (event === 'session_shutdown') { events.push(event); notified(); await notification; } });
  await start(); const first = shutdown(); const second = shutdown();
  const host = extensionHostFor(context)!;
  await expect(Promise.resolve().then(() => host.sendMessage!('Late'))).rejects.toThrow('closing');
  await expect(Promise.resolve().then(() => host.appendEntry!('late', {}))).rejects.toThrow('closing');
  expect(await host.getCommands!()).toContain('help');
  await new Promise(resolve => setImmediate(resolve));
  expect(runtime.cancelAndWait).toHaveBeenCalledOnce(); expect(events).toEqual([]); finishRun(); await reached;
  let returned = false; const joined = first.then(() => { returned = true; }); await new Promise(resolve => setImmediate(resolve)); expect(returned).toBe(false);
  finishNotification(); await Promise.all([joined, second]); expect(events).toEqual(['session_shutdown']);
  expect(runtime.executePrompt).not.toHaveBeenCalled();
});

it('retains the audience that received startup and never delivers old shutdown to a successor', async () => {
  install(); const old = vi.fn(async (_event: string) => {}); const retire = contribution(old); await start(); retire();
  const successor = vi.fn(async () => {}); contribution(successor); await shutdown();
  expect(successor).not.toHaveBeenCalled(); expect(old.mock.calls.map(call => call[0])).toEqual(['session_start']);
});

it('does not reacquire an extension runtime or a new host once shutdown has begun', async () => {
  let finish!: () => void; const held = new Promise<void>(resolve => { finish = resolve; });
  install(vi.fn(() => held)); await start(); const original = extensionHostFor(context);
  const pending = shutdown();
  try {
    expect(() => extensions.refreshExtensionsFor(context)).toThrow('closing');
    expect(extensionHostFor(context)).toBe(original);
  } finally { finish(); await pending; }
});

it('joins synchronous shutdown reentry from the released UI surface', async () => {
  const runtime = install(); const ended: string[] = [];
  contribution(async event => { if (event === 'session_shutdown') ended.push(event); }); await start();
  let reentry: Promise<void> | undefined;
  bindExtensionUiFor(context, { confirm: async () => false }, () => { reentry = shutdown(); });
  const first = shutdown(); await Promise.all([first, reentry]);
  expect(runtime.cancelAndWait).toHaveBeenCalledOnce(); expect(ended).toEqual(['session_shutdown']);
});

it('preserves a UI release failure for every shutdown caller while still joining the original run', async () => {
  const runtime = install(); await start();
  bindExtensionUiFor(context, { confirm: async () => false }, () => { throw new Error('Synthetic release failure'); });
  const first = Promise.resolve().then(() => shutdown());
  await expect(first).rejects.toThrow('Synthetic release failure');
  await expect(shutdown()).rejects.toThrow('Synthetic release failure');
  expect(runtime.cancelAndWait).toHaveBeenCalledOnce();
});

it('ignores native session return values and isolates handler errors without replacing the envelope', async () => {
  const observed: unknown[] = [];
  const handlers = new Map<string, Array<(payload: unknown) => unknown>>([['session_start', [() => ({ decision: 'block' }), () => { throw new Error('Synthetic notification failure'); }, payload => { observed.push(payload); }]]]);
  const payload = { type: 'session_start', sessionId: 'original', workspaceRoot: root, reason: 'startup' };
  await expect(runEventHandlers({ handlers, event: 'session_start', payload })).resolves.toBe(payload);
  expect(observed).toEqual([payload]);
});

it('does not alias per-prompt SessionStart and SessionEnd hooks to native session notifications', async () => {
  const observed: string[] = [];
  const handlers = new Map(['session_start', 'session_shutdown'].map(name => [name, [() => { observed.push(name); }]]));
  contribution((event, payload, aliases) => runEventHandlers({ handlers, event, payload, aliases }));
  const hooks = new HookDispatcher();
  for (const eventName of ['SessionStart', 'SessionEnd'] as const) await hooks.dispatch({ eventName, sessionId: context.session.id, workspaceRoot: root, timestamp: '', resumed: false, turnsExecuted: 0 });
  expect(observed).toEqual([]);
});
