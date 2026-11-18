import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentSession } from './agentSession.js';
import { DefaultResourceLoader } from './resourceLoader.js';
import type { ExtensionAPI } from '../extensions/runtime/inProcessLoader.js';
import { getRuntimeConfig } from '../config/runtimeConfig.js';

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
