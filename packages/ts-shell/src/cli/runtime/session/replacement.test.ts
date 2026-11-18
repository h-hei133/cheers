import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as replacement from './replacement.js';
import { SessionManager } from '../../../session/SessionManager.js';
import { ShellCommandRuntime } from '../../../core/shell/command.js';
import { initialConfiguration } from '../../../core/shell/configuration.js';
import { switchActiveSession, type ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import type { SessionChangePort, SessionChangeRequest } from '../../../core/shell/replacement.js';
import { registerCatalogContribution } from '../../../core/catalog/contributions.js';
import { runEventHandlers } from '../../../extensions/events/dispatch.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { closeExtensionsFor, installExtensionRuntime, startExtensionsFor } from '../extensions.js';
import { HookDispatcher } from '../../../core/hooks/hookDispatcher.js';
import { bindExtensionUiFor } from '../extensions/host.js';
import * as extensions from '../extensions.js';
import { ExtensionService } from '../../../extensions/service.js';
import { appendTranscriptEvent } from '../../../session/transcript/sessionTranscript.js';
import { createTranscriptEntryId } from '../../../session/sessionEventCodec.js';
import { extensionHostFor } from '../extensions/host.js';
import { bindSessionSurface } from './surface.js';
import { SubmissionQueue } from '../../interactive/inputQueue.js';
import { attachSubmissionQueue } from '../inputQueue.js';
import { resumeShellSession } from '../../../core/shell/recovery.js';
import { runResumeLikeShellAction } from '../../../core/shell/continueShellActionRuntime.js';
import { runCliSessionCommand } from '../../../entrypoints/cliSessionModule.js';
import { runCliWorkspaceCommand } from '../../workspace/command.js';
import { routeInteractiveCommand } from '../../interactive/interactiveCommandRouter.js';
import { runPrintSessionAction } from '../../print/actions.js';
import { startFreshSession } from '../../interactive/history.js';
import { Transcript } from '../../../presentation/tui/transcript/container.js';
import { textBlock } from '../../../presentation/tui/transcript/blocks.js';

let root: string, context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime;
const cleanups: Array<() => void> = [];
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true }); root = fs.mkdtempSync(path.join(temporary, 'session-change-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  manager = new SessionManager(); const session = manager.createNew(root);
  const seed = { session, cwd: root, projectRoot: root, originalCwd: root, gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root) };
  context = { ...seed, configuration: initialConfiguration(seed), activeSession: { sessionId: session.id, sessionProjectDir: root } } as ShellRuntimeContext;
  const commands = new ShellCommandRuntime();
  runtime = { commands, isRunning: () => Boolean(commands.current), input: () => undefined, getPermissionScope: () => 'ask', cancelAndWait: vi.fn(async () => {}),
    getCurrentRunController: () => commands.current?.controller ?? null } as unknown as ShellSessionRuntime;
  installExtensionRuntime(context, runtime, () => ({ sessionId: context.session.id, workspaceRoot: root, hooks: new HookDispatcher(), emit() {}, permissionScope: 'ask' }), manager);
});
afterEach(async () => { cleanups.splice(0).forEach(fn => fn()); await closeExtensionsFor(context).catch(() => {}); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });
function install() {
  const fn = (replacement as unknown as { installSessionChange?: (context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime) => void }).installSessionChange;
  expect(fn).toBeTypeOf('function'); fn!(context, manager, runtime); return context.sessionChange as SessionChangePort;
}
function events(handlers: ReadonlyMap<string, readonly ((event: unknown) => unknown)[]>) {
  const retire = registerCatalogContribution({ root, sessionId: context.session.id, commands: [], tools: [], skills: () => [],
    onEvent: (event, payload, aliases, signal) => runEventHandlers({ handlers, event, payload, aliases, signal }) }); cleanups.push(retire);
}
function request(overrides: Partial<SessionChangeRequest> = {}): SessionChangeRequest {
  return { reason: 'new', prepare: () => manager.createNew(root, { activate: false }), publish: session => { switchActiveSession(context, session); }, ...overrides };
}

it('honours before_switch cancel before creating a candidate or changing the durable selection', async () => {
  events(new Map([['session_before_switch', [() => ({ cancel: true })]]])); await startExtensionsFor(context);
  const change = install(), original = context.session, prepare = vi.fn(() => manager.createNew(root, { activate: false }));
  const result = await change(request({ prepare }));
  expect(result.status).toBe('cancelled'); expect(prepare).not.toHaveBeenCalled(); expect(context.session).toBe(original);
  expect(manager.getCurrentSessionForProject(root)?.id).toBe(original.id);
});

it('uses the original before and shutdown handlers before activating and preparing the successor', async () => {
  const order: string[] = [], original = context.session;
  events(new Map([['session_before_switch', [() => { order.push('before'); return { cancel: false }; }]], ['session_shutdown', [() => { order.push('shutdown'); expect(context.session.id).toBe(original.id); }]]]));
  await startExtensionsFor(context); const change = install();
  const result = await change(request({ publish: session => { order.push('publish'); switchActiveSession(context, session); } }));
  expect(result.status).toBe('changed'); expect(order).toEqual(['before', 'shutdown', 'publish']);
  expect(context.session.id).not.toBe(original.id); expect(manager.getCurrentSessionForProject(root)?.id).toBe(context.session.id);
  expect(runtime.cancelAndWait).not.toHaveBeenCalled();
});

it('refuses a late before result after the active source changes and leaves the successor selection intact', async () => {
  let release!: () => void; let reached!: () => void; const ready = new Promise<void>(resolve => { reached = resolve; });
  events(new Map([['session_before_switch', [async () => { reached(); await new Promise<void>(resolve => { release = resolve; }); return { cancel: false }; }]]]));
  await startExtensionsFor(context); const change = install(), prepare = vi.fn(() => manager.createNew(root, { activate: false }));
  const pending = change(request({ prepare })); await ready;
  const successor = manager.createNew(root); context.session = successor; release();
  const result = await pending; expect(result.status).toBe('refused'); expect(prepare).not.toHaveBeenCalled(); expect(manager.getCurrentSessionForProject(root)?.id).toBe(successor.id);
});

it('uses before_fork cancellation without copying the source', async () => {
  events(new Map([['session_before_fork', [() => ({ cancel: true })]]])); await startExtensionsFor(context);
  const change = install(), original = context.session, fork = vi.fn(() => manager.fork(original.id, root, { activate: false }));
  const result = await change(request({ reason: 'fork', prepare: fork }));
  expect(result.status).toBe('cancelled'); expect(fork).not.toHaveBeenCalled(); expect(context.session).toBe(original);
});

it('reports a quiesced shutdown failure as unknown and blocks later operations', async () => {
  await startExtensionsFor(context);
  const change = install(), source = context.session;
  bindExtensionUiFor(context, { confirm: async () => false }, () => { throw new Error('Synthetic release failure'); });
  const result = await change(request());
  expect(result.status).toBe('unknown'); expect(context.workspaceIssue).toContain('not verified');
  expect(context.session).toBe(source); expect(manager.getCurrentSessionForProject(root)?.id).toBe(source.id);
  expect(() => extensions.refreshExtensionsFor(context)).toThrow('closing');
});

it('joins original resource retirement before publishing or starting the successor', async () => {
  await startExtensionsFor(context);
  let release!: () => void, reached!: () => void;
  const ready = new Promise<void>(resolve => { reached = resolve; }); const held = new Promise<void>(resolve => { release = resolve; });
  const close = ExtensionService.prototype.close;
  vi.spyOn(ExtensionService.prototype, 'close').mockImplementationOnce(async function () { reached(); await held; await close.call(this); });
  const change = install(), publish = vi.fn(session => switchActiveSession(context, session)), source = context.session;
  const pending = change(request({ publish }));
  try {
    await ready; await new Promise(resolve => setImmediate(resolve));
    expect(publish).not.toHaveBeenCalled(); expect(context.session).toBe(source);
  } finally { release(); await pending; }
  expect((await pending).status).toBe('changed'); expect(publish).toHaveBeenCalledOnce();
});

it('blocks successor activation when original resource retirement is unknown', async () => {
  await startExtensionsFor(context);
  vi.spyOn(ExtensionService.prototype, 'close').mockRejectedValueOnce(new Error('Synthetic drain failure'));
  const change = install(), publish = vi.fn(), source = context.session;
  const result = await change(request({ publish }));
  expect(result.status).toBe('unknown'); expect(context.workspaceIssue).toContain('not verified');
  expect(publish).not.toHaveBeenCalled(); expect(manager.getCurrentSessionForProject(root)?.id).toBe(source.id);
});

it('preserves a valid working subdirectory during same-project replacement', async () => {
  const subdirectory = path.join(root, 'subdirectory'); fs.mkdirSync(subdirectory); context.cwd = subdirectory;
  await startExtensionsFor(context); const change = install();
  expect((await change(request())).status).toBe('changed'); expect(context.cwd).toBe(subdirectory);
  expect(context.projectRoot).toBe(root); expect(context.workspaceIssue).toBeUndefined();
});

it('binds the before-switch target to the exact prepared saved identity', async () => {
  const declared = manager.createNew(root, { activate: false }), different = manager.createNew(root, { activate: false });
  const shutdown = vi.fn(); events(new Map([['session_shutdown', [shutdown]]])); await startExtensionsFor(context);
  const change = install(), source = context.session;
  const result = await change(request({ reason: 'resume', targetSessionId: declared.id, prepare: () => different }));
  expect(result.status).toBe('refused'); expect(context.session).toBe(source); expect(shutdown).not.toHaveBeenCalled();
  expect(manager.getCurrentSessionForProject(root)?.id).toBe(source.id);
});

it('fences cancellation that arrives during successor startup after activation', async () => {
  await startExtensionsFor(context); const change = install();
  const started = vi.spyOn(extensions, 'startExtensionsFor').mockImplementation(async () => { runtime.commands.current!.controller.abort(); });
  const result = await change(request()); started.mockRestore();
  expect(result.status).toBe('unknown'); expect(context.workspaceIssue).toContain('not verified');
});

it.each(['object', 'activation'] as const)('rejects a same-ID successor %s during startup', async kind => {
  await startExtensionsFor(context); const change = install(), start = extensions.startExtensionsFor;
  const started = vi.spyOn(extensions, 'startExtensionsFor').mockImplementation(async (...args) => {
    await start(...args);
    if (kind === 'object') context.session = { ...context.session };
    else manager.setCurrentSessionForProject(root, context.session.id);
  });
  const result = await change(request()); started.mockRestore();
  expect(result.status).toBe('unknown'); expect(context.workspaceIssue).toContain('not verified');
});

it('preserves a competing durable activation installed during old shutdown', async () => {
  let successor!: string;
  events(new Map([['session_shutdown', [() => { successor = manager.createNew(root).id; }]]]));
  await startExtensionsFor(context); const change = install();
  const result = await change(request());
  expect(result.status).toBe('unknown'); expect(context.workspaceIssue).toContain('not verified');
  expect(manager.getCurrentSessionForProject(root)?.id).toBe(successor);
});

it.each(['message', 'state', 'prefix', 'directory'] as const)('rejects successor %s changes during startup', async kind => {
  await startExtensionsFor(context); const change = install(), start = extensions.startExtensionsFor;
  const started = vi.spyOn(extensions, 'startExtensionsFor').mockImplementation(async (...args) => {
    await start(...args);
    const directory = manager.getSessionDirPath(context.session.id), transcript = path.join(directory, 'transcript.jsonl');
    if (kind === 'message') appendTranscriptEvent(transcript, { type: 'message', role: 'user', id: createTranscriptEntryId('message'), timestamp: new Date().toISOString(), content: 'Competing question' });
    else if (kind === 'state') {
      const statePath = path.join(directory, 'state.json'), state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      fs.writeFileSync(statePath, JSON.stringify({ ...state, competing: true }));
    } else if (kind === 'prefix') {
      const original = fs.readFileSync(transcript, 'utf8'); fs.writeFileSync(transcript, original.replace('timestamp', 'replaced'));
    } else {
      const displaced = directory + '-displaced'; fs.renameSync(directory, displaced); fs.cpSync(displaced, directory, { recursive: true });
    }
  });
  const result = await change(request()); started.mockRestore();
  expect(result.status).toBe('unknown'); expect(context.workspaceIssue).toContain('not verified');
});

it('allows only report appends from successor startup and binds its UI before notifying', async () => {
  const source = context.session; manager.addTurn(source.id, { role: 'user', content: 'Original question' });
  const target = manager.fork(source.id, root, { activate: false });
  await startExtensionsFor(context); const change = install(), start = extensions.startExtensionsFor;
  const confirm = vi.fn(async () => true);
  cleanups.push(bindSessionSurface(context, () => { bindExtensionUiFor(context, { confirm }); }));
  const started = vi.spyOn(extensions, 'startExtensionsFor').mockImplementation(async (...args) => {
    await start(...args);
    const host = extensionHostFor(context)!;
    expect(await host.ui!.confirm!('Successor', 'Continue?')).toBe(true);
    await host.appendEntry!('startup', { ready: true });
  });
  const result = await change(request({ reason: 'resume', targetSessionId: target.id, prepare: () => target })); started.mockRestore();
  expect(result.status).toBe('changed'); expect(confirm).toHaveBeenCalledOnce();
  expect(manager.getSession(target.id)?.reports?.at(-1)?.text).toContain('ready');
});

it('queues startup messages through the current input owner after its single replacement command settles', async () => {
  await startExtensionsFor(context); const change = install(), start = extensions.startExtensionsFor;
  const queue = new SubmissionQueue(() => context.session, () => {}), run = vi.fn(async () => { expect(runtime.commands.current).toBeUndefined(); });
  cleanups.push(attachSubmissionQueue(runtime, queue, run, () => !runtime.isRunning()));
  const started = vi.spyOn(extensions, 'startExtensionsFor').mockImplementation(async (...args) => {
    await start(...args); await extensionHostFor(context)!.sendMessage!('Startup request');
    expect(run).not.toHaveBeenCalled();
  });
  const result = await change(request()); started.mockRestore();
  expect(result.status).toBe('changed'); await vi.waitFor(() => expect(run).toHaveBeenCalledWith('Startup request'));
});

it('refuses same-ID owner replacement during the final native saved-session acquisition', async () => {
  await startExtensionsFor(context); const change = install(), start = extensions.startExtensionsFor;
  let final = false;
  const started = vi.spyOn(extensions, 'startExtensionsFor').mockImplementation(async (...args) => { await start(...args); final = true; });
  const get = manager.getSession.bind(manager);
  vi.spyOn(manager, 'getSession').mockImplementation(id => {
    const result = get(id); if (final) { final = false; context.session = { ...context.session }; } return result;
  });
  const result = await change(request()); started.mockRestore();
  expect(result.status).toBe('unknown'); expect(context.workspaceIssue).toContain('not verified');
});

it('rejects old before-event message submission before it can enter the successor queue', async () => {
  const queue = new SubmissionQueue(() => context.session, () => {}), run = vi.fn(async () => {});
  cleanups.push(attachSubmissionQueue(runtime, queue, run, () => !runtime.isRunning()));
  let refusal: unknown;
  const send = vi.fn(async () => { try { await extensionHostFor(context)!.sendMessage!('Old callback action'); } catch (error) { refusal = error; } return { cancel: true }; });
  events(new Map([['session_before_switch', [send]]])); await startExtensionsFor(context); const change = install();
  expect((await change(request())).status).toBe('cancelled'); expect(send).toHaveBeenCalledOnce();
  expect(refusal).toBeInstanceOf(Error); expect((refusal as Error).message).toContain('replacement');
  expect(queue.length).toBe(0); expect(run).not.toHaveBeenCalled();
});

it('removes only startup messages of an aborted replacement and preserves user-owned input', async () => {
  await startExtensionsFor(context); const change = install(), start = extensions.startExtensionsFor;
  const queue = new SubmissionQueue(() => context.session, () => {}), run = vi.fn(async () => {});
  cleanups.push(attachSubmissionQueue(runtime, queue, run, () => !runtime.isRunning()));
  const started = vi.spyOn(extensions, 'startExtensionsFor').mockImplementation(async (...args) => {
    await start(...args); queue.push('Explicit user input'); await extensionHostFor(context)!.sendMessage!('Unaccepted startup input');
    runtime.commands.current!.controller.abort();
  });
  const result = await change(request()); started.mockRestore();
  expect(result.status).toBe('unknown');
  expect(queue.control.entries().map(item => item.text)).toEqual(['Explicit user input']); expect(run).not.toHaveBeenCalled();
});

it('rejects target history modified between native activation and successor capture', async () => {
  await startExtensionsFor(context); const change = install(), resume = manager.tryResume.bind(manager);
  vi.spyOn(manager, 'tryResume').mockImplementation((...args) => {
    const result = resume(...args);
    if (result.ok) appendTranscriptEvent(path.join(manager.getSessionDirPath(result.session.id), 'transcript.jsonl'),
      { type: 'message', role: 'user', id: createTranscriptEntryId('message'), timestamp: new Date().toISOString(), content: 'Post-activation competing history' });
    return result;
  });
  const result = await change(request());
  expect(result.status).toBe('unknown'); expect(context.workspaceIssue).toContain('not verified');
});

it.each(['resume', 'continue', 'switch', 'workspace', 'fork', 'clear'] as const)('keeps the live %s consumer on its source after before cancellation', async kind => {
  manager.addTurn(context.session.id, { role: 'user', content: 'Original question' });
  const source = context.session, target = manager.createNew(root, { activate: false });
  if (kind === 'continue') { manager.persistUserPromptBarrier(target.id, 'Completed question'); manager.saveCompleted(target.id); }
  events(new Map([['session_before_switch', [() => ({ cancel: true })]], ['session_before_fork', [() => ({ cancel: true })]]]));
  await startExtensionsFor(context); install();
  const count = fs.readdirSync(path.dirname(manager.getSessionDirPath(source.id))).length;
  const lines: string[] = [], renderer = { renderLine: (line: string) => { lines.push(line); } } as never;
  if (kind === 'resume') expect(await resumeShellSession({ requestedSessionId: target.id, runtimeContext: context, sessionManager: manager, renderer })).toEqual({ resumed: false });
  else if (kind === 'continue') {
    const prompt = vi.fn(async () => {});
    await runResumeLikeShellAction({ slashResult: { kind: 'shell-action', action: 'continue-session', sessionId: target.id, continuationPrompt: 'Follow up' },
      source: 'interactive', printMode: false, runtimeContext: context, sessionManager: manager, renderer,
      switchRuntimeSessionProjectContext: () => {}, renderSessionCommandMap: () => {}, executeResolvedPromptTurn: prompt });
    expect(prompt).not.toHaveBeenCalled();
  } else if (kind === 'switch') await runCliSessionCommand({ renderer, runtimeContext: context, sessionManager: manager, sessionAction: 'switch', sessionId: target.id, printMode: true });
  else if (kind === 'workspace') {
    const other = path.join(root, 'other'); fs.mkdirSync(other);
    await runCliWorkspaceCommand({ renderer, runtimeContext: context, sessionManager: manager, workspaceAction: 'attach', workspaceTarget: other, printMode: true });
  } else if (kind === 'fork') {
    await routeInteractiveCommand({ prompt: '/fork here', runtimeContext: context, sessionManager: manager, sessionRuntime: runtime, renderer,
      logger: { info() {}, error() {} }, approvalTrustPolicy: {}, turnNumber: 0 } as never);
  } else await runPrintSessionAction({ kind: 'shell-action', action: 'clear-session' }, { runtimeContext: context, sessionManager: manager, sessionRuntime: runtime, renderLine: line => { lines.push(line); } });
  expect(context.session).toBe(source); expect(context.projectRoot).toBe(root);
  expect(manager.getCurrentSessionForProject(root)?.id).toBe(source.id);
  expect(fs.readdirSync(path.dirname(manager.getSessionDirPath(source.id)))).toHaveLength(count);
  expect(lines.join('\n')).not.toMatch(/Resumed session|Switched session|Attached project context|Started a new session|Forked .* into/);
});

it('preserves the visible conversation when clear is cancelled', async () => {
  events(new Map([['session_before_switch', [() => ({ cancel: true })]]])); await startExtensionsFor(context); install();
  const transcript = new Transcript(), original = textBlock('user', 'Keep this conversation'); transcript.append(original);
  const result = await startFreshSession({ context, sessionManager: manager, transcript });
  expect(result).toBe(false); expect(transcript.all()).toEqual([original]);
});
