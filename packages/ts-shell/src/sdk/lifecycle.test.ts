import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentSession } from './agentSession.js';
import { DefaultResourceLoader } from './resourceLoader.js';
import type { ExtensionAPI } from '../extensions/runtime/inProcessLoader.js';
import { getRuntimeConfig } from '../config/runtimeConfig.js';
import { ShellSessionRuntime } from '../core/shell/sessionRuntime.js';
import { readLogicalModel } from '../session/model/logical.js';

interface SessionNotification {
  readonly type: 'session_start' | 'session_shutdown';
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly reason: string;
}

let root: string;
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, 'sdk-lifecycle-'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

it('refuses in-place replacement before preparing a candidate while preserving SDK resources', async () => {
  let api!: ExtensionAPI;
  const before = vi.fn(), confirm = vi.fn(async () => true);
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true, extensionFactories: [value => {
    api = value; api.registerCommand({ name: 'owned', description: 'SDK-owned', execute: async () => 'Ready' });
    api.on('session_before_switch', before);
  }] });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all', ui: { confirm } });
  const prepare = vi.fn(() => session.sessionManager.createNew(root, { activate: false })), source = session.runtimeContext.session;
  try {
    const result = await session.runtimeContext.sessionChange!({ reason: 'new', prepare, publish: () => {} });
    expect(result).toMatchObject({ status: 'refused', reason: expect.stringContaining('AgentSession') });
    expect(before).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
    expect(session.runtimeContext.session).toBe(source); expect(await api.getCommands()).toContain('owned');
    expect(await api.ui.confirm('Still bound', 'Continue?')).toBe(true);
    expect(session.sessionManager.getCurrentSessionForProject(root)?.id).toBe(source.id);
  } finally { await session.dispose(); }
});

it('starts the SDK session once before create returns and retains that start across prompts', async () => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'Workspace text');
  const events: SessionNotification[] = [];
  const ready: Array<{ text: string; commands: readonly string[]; confirmed: boolean; scope: unknown }> = [];
  const scope = vi.spyOn(ShellSessionRuntime.prototype, 'setPermissionScope');
  const confirm = vi.fn(async () => true);
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true, extensionFactories: [api => {
    api.registerCommand({ name: 'captured', description: 'Captured command', execute: async () => 'Captured' });
    api.on('session_start', async event => {
      events.push(event as SessionNotification);
      ready.push({ text: await api.readWorkspaceFile('note.txt'), commands: await api.getCommands(),
        confirmed: await api.ui.confirm('Starting', 'Ready?'), scope: scope.mock.calls.at(-1)?.[0] });
      await hold;
      return { decision: 'block', replaced: true };
    });
    api.on('session_start', event => { events.push(event as SessionNotification); });
  }] });
  await loader.reload();
  let returned = false;
  const creating = createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all',
    permissionScope: 'accept-edits', ui: { confirm } }).then(result => { returned = true; return result; });
  void creating.catch(() => {});
  try {
    await vi.waitFor(() => expect(ready).toHaveLength(1));
    expect(returned).toBe(false);
    expect(ready[0]).toEqual({ text: 'Workspace text', commands: expect.arrayContaining(['captured']),
      confirmed: true, scope: 'accept-edits' });
    release();
    const { session } = await creating;
    const notification = { type: 'session_start', sessionId: session.sessionId, workspaceRoot: root, reason: 'startup' };
    expect(events).toEqual([notification, notification]);
    expect(confirm).toHaveBeenCalledTimes(1);
    await session.prompt('Say first.');
    await session.prompt('Say second.');
    expect(events).toEqual([notification, notification]);
  } finally { release(); const created = await creating; await created.session.dispose(); }
});

it('publishes SDK session_start after selecting the startup model and applying its permission scope', async () => {
  const observed: Array<{ event: SessionNotification; model: unknown; scope: unknown }> = [];
  const scope = vi.spyOn(ShellSessionRuntime.prototype, 'setPermissionScope');
  const route = vi.fn(() => ({ provider: 'openai', modelId: 'physical' }));
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true, extensionFactories: [api => {
    api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Adaptive', route });
    api.on('session_start', event => {
      const notification = event as SessionNotification;
      observed.push({ event: notification, model: readLogicalModel(notification.sessionId), scope: scope.mock.calls.at(-1)?.[0] });
    });
  }] });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all',
    model: 'adaptive/auto', permissionScope: 'allow-all' });
  try {
    expect(observed).toEqual([{ event: { type: 'session_start', sessionId: session.sessionId, workspaceRoot: root, reason: 'startup' },
      model: { provider: 'adaptive', model: 'auto' }, scope: 'allow-all' }]);
    expect(route).not.toHaveBeenCalled();
  } finally { await session.dispose(); }
});

it('joins one SDK shutdown while preserving original read access and refusing new host work', async () => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'Workspace text');
  let api!: ExtensionAPI;
  const events: SessionNotification[] = [];
  const reads: Array<{ text: string; tools: readonly string[]; commands: readonly string[] }> = [];
  const refused: Array<{ operation: string; error: unknown }> = [];
  const confirmed: boolean[] = [];
  const confirm = vi.fn(async () => true);
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true, extensionFactories: [value => {
    api = value;
    value.registerCommand({ name: 'captured', description: 'Captured command', execute: async () => 'Captured' });
    value.on('session_shutdown', async event => {
      events.push(event as SessionNotification);
      reads.push({ text: await value.readWorkspaceFile('note.txt'), tools: await value.getActiveTools(), commands: await value.getCommands() });
      try { await value.sendMessage('A shutdown must not start another prompt'); }
      catch (error) { refused.push({ operation: 'sendMessage', error }); }
      try { await value.appendEntry('shutdown', 'A shutdown must not append another entry'); }
      catch (error) { refused.push({ operation: 'appendEntry', error }); }
      confirmed.push(await value.ui.confirm('Shutdown', 'This must not open'));
      await hold;
      return { decision: 'block', replaced: true };
    });
    value.on('session_shutdown', event => { events.push(event as SessionNotification); });
  }] });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all', ui: { confirm } });
  const cancel = vi.spyOn(session.sessionRuntime, 'cancelAndWait');
  const terminate = vi.spyOn(session.sessionRuntime, 'terminate');
  let finished = false;
  const first = session.dispose();
  const second = session.dispose();
  const settled = Promise.allSettled([first, second]).then(results => { finished = true; return results; });
  try {
    expect(first).toBe(second);
    await vi.waitFor(() => expect(confirmed).toEqual([false]));
    expect(reads).toEqual([{ text: 'Workspace text', tools: [], commands: expect.arrayContaining(['captured']) }]);
    expect(refused).toEqual(['sendMessage', 'appendEntry'].map(operation => ({ operation, error: expect.any(Error) })));
    expect(confirm).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(terminate).not.toHaveBeenCalled();
    expect(finished).toBe(false);
    expect(await api.readWorkspaceFile('note.txt')).toBe('Workspace text');
    release();
    expect(await settled).toEqual([{ status: 'fulfilled', value: undefined }, { status: 'fulfilled', value: undefined }]);
    const notification = { type: 'session_shutdown', sessionId: session.sessionId, workspaceRoot: root, reason: 'quit' };
    expect(events).toEqual([notification, notification]);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(() => api.readWorkspaceFile('note.txt')).toThrow('retired');
    await session.dispose();
    expect(events).toHaveLength(2);
  } finally { release(); await settled; }
});

it('joins the pending agent_settled notification before publishing SDK session_shutdown', async () => {
  const events: string[] = [];
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true, extensionFactories: [api => {
    api.on('agent_settled', async () => { events.push('agent_settled'); await hold; events.push('agent_settled_done'); });
    api.on('session_shutdown', () => { events.push('session_shutdown'); });
  }] });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  const prompting = Promise.allSettled([session.prompt('Say done.')]);
  let disposing: Promise<PromiseSettledResult<void>[]> | undefined;
  try {
    await vi.waitFor(() => expect(events).toEqual(['agent_settled']));
    const cancel = vi.spyOn(session.sessionRuntime, 'cancelAndWait');
    let finished = false;
    disposing = Promise.allSettled([session.dispose()]).then(results => { finished = true; return results; });
    await new Promise(resolve => setImmediate(resolve));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(finished).toBe(false);
    expect(events).toEqual(['agent_settled']);
    release();
    await prompting;
    expect(await disposing).toEqual([{ status: 'fulfilled', value: undefined }]);
    expect(events).toEqual(['agent_settled', 'agent_settled_done', 'session_shutdown']);
  } finally { release(); await prompting; await (disposing ?? session.dispose()); }
});

it('does not notify a loader successor when disposing the SDK session that consumed its retired generation', async () => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'Workspace text');
  const apis: ExtensionAPI[] = [];
  const events: Array<{ generation: number; event: SessionNotification }> = [];
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true, extensionFactories: [api => {
    apis.push(api);
    const generation = apis.length;
    api.on('session_start', event => { events.push({ generation, event: event as SessionNotification }); });
    api.on('session_shutdown', event => { events.push({ generation, event: event as SessionNotification }); });
  }] });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  try {
    await loader.reload();
    await session.dispose();
    expect(events).toEqual([{ generation: 1,
      event: { type: 'session_start', sessionId: session.sessionId, workspaceRoot: root, reason: 'startup' } }]);
    expect(() => apis[0]!.readWorkspaceFile('note.txt')).toThrow('retired');
    expect(await apis[1]!.readWorkspaceFile('note.txt')).toBe('Workspace text');
  } finally { await session.dispose(); }
});

it('continues SDK initialization and cleanup after native session notification handlers throw', async () => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'Workspace text');
  let api!: ExtensionAPI;
  const observed: SessionNotification[] = [];
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true, extensionFactories: [value => {
    api = value;
    value.on('session_start', () => { throw new Error('Synthetic startup notification failure'); });
    value.on('session_start', event => { observed.push(event as SessionNotification); });
    value.on('session_shutdown', () => { throw new Error('Synthetic shutdown notification failure'); });
    value.on('session_shutdown', event => { observed.push(event as SessionNotification); });
  }] });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  const terminate = vi.spyOn(session.sessionRuntime, 'terminate');
  try {
    await session.dispose();
    expect(observed).toEqual([
      { type: 'session_start', sessionId: session.sessionId, workspaceRoot: root, reason: 'startup' },
      { type: 'session_shutdown', sessionId: session.sessionId, workspaceRoot: root, reason: 'quit' },
    ]);
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(() => api.readWorkspaceFile('note.txt')).toThrow('retired');
  } finally { await session.dispose(); }
});

it('retires the loaded extension capabilities when their consuming session is disposed', async () => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'Workspace text');
  let api!: ExtensionAPI;
  let effects = 0;
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [value => {
      api = value;
      value.registerTool({ name: 'captured', description: 'Captured tool', argsSchema: { type: 'object' },
        execute: async () => { effects++; return { success: true, output: 'Executed' }; } });
    }] });
  await loader.reload();
  const tool = loader.getExtensions().extensions[0]!.extension.tools[0]!;
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  expect(await api.readWorkspaceFile('note.txt')).toBe('Workspace text');
  await session.abort();
  expect(await api.readWorkspaceFile('note.txt')).toBe('Workspace text');
  await session.dispose();
  expect(() => api.readWorkspaceFile('note.txt')).toThrow('retired');
  await expect(Promise.resolve().then(() => tool.execute({}, { workspaceRoot: root } as never))).rejects.toThrow();
  expect(effects).toBe(0);
  expect(() => api.events.emit('late')).toThrow('retired');
});

it('delivers native events through the public extension API and joins final settlement', async () => {
  const events: Array<{ type: string; content?: unknown }> = []; let ready!: () => void; let release!: () => void;
  const reached = new Promise<void>(resolve => { ready = resolve; }); const wait = new Promise<void>(resolve => { release = resolve; });
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [api => {
      api.on('agent_start', event => { events.push({ type: event.type }); });
      api.on('message_end', event => { events.push({ type: event.type, content: event.message.content }); });
      api.on('agent_end', event => { events.push({ type: event.type }); });
      api.on('agent_settled', async event => { events.push({ type: event.type }); ready(); await wait; });
    }] });
  await loader.reload(); const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  try {
    let returned = false; const pending = session.prompt('Say done.').then(() => { returned = true; });
    await reached; expect(returned).toBe(false);
    expect(events[0]?.type).toBe('agent_start'); expect(events.filter(event => event.type === 'agent_end')).toHaveLength(1);
    release(); await pending;
    expect(events.at(-1)?.type).toBe('agent_settled');
  } finally { release(); await session.dispose(); }
});

it('ignores notification return values while preserving original payloads for later handlers', async () => {
  const observed: string[] = [];
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [api => {
      // Dynamic registration remains compatible, but native notifications have no result contract.
      (api.on as (name: string, handler: (event: unknown) => unknown) => void)('agent_start', () => ({ decision: 'block', replaced: true }));
      api.on('agent_start', event => { observed.push(event.type); });
    }] });
  await loader.reload(); const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  try { await session.prompt('Say done.'); expect(observed).toEqual(['agent_start']); }
  finally { await session.dispose(); }
});

it('keeps later native notification handlers admitted after one handler throws', async () => {
  const observed: string[] = [];
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [api => {
      api.on('agent_start', () => { throw new Error('Synthetic notification failure'); });
      api.on('agent_start', event => { observed.push(event.type); });
    }] });
  await loader.reload(); const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  try { await session.prompt('Say done.'); expect(observed).toEqual(['agent_start']); }
  finally { await session.dispose(); }
});

it('refuses a late extension prompt after the run has declared settlement', async () => {
  let refused: unknown; let accepted = false;
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true, extensionFactories: [api => {
    api.on('agent_settled', async () => { try { await api.sendMessage('This cannot enter the settled run'); accepted = true; } catch (error) { refused = error; } });
  }] });
  await loader.reload(); const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  try {
    await session.prompt('Say done.'); expect(accepted).toBe(false);
    expect(refused).toBeInstanceOf(Error);
    expect(String((refused as Error).message)).toContain('settled');
  } finally { await session.dispose(); }
});

it('releases only the loader generation consumed by the disposed session', async () => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'Workspace text');
  const apis: ExtensionAPI[] = [];
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [api => { apis.push(api); }] });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  const consumed = apis[0]!;
  await loader.reload();
  const successor = apis[1]!;
  await session.dispose();
  expect(() => consumed.readWorkspaceFile('note.txt')).toThrow('retired');
  expect(await successor.readWorkspaceFile('note.txt')).toBe('Workspace text');
});

it('joins the same cleanup for every concurrent dispose call', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { session } = await createAgentSession({ cwd: root, noTools: 'all' });
  const cancel = vi.spyOn(session.sessionRuntime, 'cancelAndWait').mockImplementation(() => gate);
  const terminate = vi.spyOn(session.sessionRuntime, 'terminate');
  let finished = 0;
  const first = session.dispose().then(() => { finished++; });
  const second = session.dispose().then(() => { finished++; });
  await new Promise(resolve => setImmediate(resolve));
  expect(finished).toBe(0);
  expect(cancel).toHaveBeenCalledTimes(1);
  release();
  await Promise.all([first, second]);
  expect(finished).toBe(2);
  expect(terminate).toHaveBeenCalledTimes(1);
});

it('does not retire the first session when a second session cannot claim its resource loader', async () => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'Workspace text');
  let api!: ExtensionAPI;
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [value => { api = value; }] });
  await loader.reload();
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  try {
    await expect(createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' })).rejects.toThrow('another host');
    expect(await api.readWorkspaceFile('note.txt')).toBe('Workspace text');
    expect(await api.getActiveTools()).toEqual([]);
  } finally { await session.dispose(); }
});

it('finishes host cleanup while reporting a resource retirement failure to every dispose caller', async () => {
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true });
  await loader.reload();
  const retirement = vi.fn(() => { throw new Error('Resource retirement failed'); });
  vi.spyOn(loader, 'captureRetirement').mockImplementation(() => retirement);
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  const cancel = vi.spyOn(session.sessionRuntime, 'cancelAndWait');
  const terminate = vi.spyOn(session.sessionRuntime, 'terminate');
  const first = session.dispose();
  const second = session.dispose();
  await expect(first).rejects.toThrow('Resource retirement failed');
  await expect(second).rejects.toThrow('Resource retirement failed');
  expect(retirement).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(terminate).toHaveBeenCalledTimes(1);
});

it.each([false, true])('rejects a stale resource snapshot while preserving loader ownership if options mutate: %s', async mutate => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'Workspace text');
  const apis: ExtensionAPI[] = [];
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [api => { apis.push(api); }] });
  await loader.reload();
  const options = { cwd: root, resourceLoader: loader as DefaultResourceLoader | undefined, noTools: 'all' as const };
  const creating = createAgentSession(options);
  const observed = creating.then(value => ({ value }), error => ({ error }));
  if (mutate) options.resourceLoader = undefined;
  await loader.reload();
  const result = await observed;
  if ('value' in result) await result.value.session.dispose();
  expect(result).toHaveProperty('error');
  expect(await apis[1]!.readWorkspaceFile('note.txt')).toBe('Workspace text');
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  await session.dispose();
});

it('does not replace the first session deny rules when another session fails to claim its loader', async () => {
  fs.writeFileSync(path.join(root, 'note.txt'), 'Workspace text');
  let api!: ExtensionAPI;
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true,
    extensionFactories: [value => { api = value; }] });
  await loader.reload();
  const config = getRuntimeConfig(root);
  const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all',
    runtimeConfig: { ...config, denyRules: [{ tool: 'read', pattern: path.join(root, 'note.txt') }] } });
  try {
    expect(() => api.readWorkspaceFile('note.txt')).toThrow();
    await expect(createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all',
      runtimeConfig: { ...config, denyRules: [] } })).rejects.toThrow('another host');
    expect(() => api.readWorkspaceFile('note.txt')).toThrow();
  } finally { await session.dispose(); }
});

it('does not commit a host binding if acquiring its retirement callback fails', async () => {
  const loader = new DefaultResourceLoader({ cwd: root, noSkills: true, noThemes: true });
  await loader.reload();
  const capture = loader.captureRetirement.bind(loader);
  const failed = vi.spyOn(loader, 'captureRetirement')
    .mockImplementationOnce(capture)
    .mockImplementationOnce(() => { throw new Error('Retirement capture failed'); });
  await expect(createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' })).rejects.toThrow('Retirement capture failed');
  expect(failed).toHaveBeenCalledTimes(2);
  failed.mockRestore();
  const creating = createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all' });
  await expect(creating).resolves.toHaveProperty('session');
  const { session } = await creating;
  await session.dispose();
});

it('waits for asynchronous cleanup and reports its rejection to every dispose caller', async () => {
  const { session } = await createAgentSession({ cwd: root, noTools: 'all' });
  const failure = new Error('Resource cache cleanup failed');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const cleanup = vi.fn(async (): Promise<never> => { await gate; throw failure; });
  session.runtimeContext.freshState = { clearCache: cleanup };
  const cancel = vi.spyOn(session.sessionRuntime, 'cancelAndWait');
  const terminate = vi.spyOn(session.sessionRuntime, 'terminate');
  const first = session.dispose();
  const second = session.dispose();
  let finished = false;
  const settled = Promise.allSettled([first, second]).then(results => { finished = true; return results; });
  await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
  expect(finished).toBe(false);
  expect(terminate).not.toHaveBeenCalled();
  release();
  expect(await settled).toEqual([
    { status: 'rejected', reason: failure },
    { status: 'rejected', reason: failure },
  ]);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(terminate).toHaveBeenCalledTimes(1);
});
