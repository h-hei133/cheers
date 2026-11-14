import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI, ExtensionHostBridge } from '../extensions/runtime/inProcessLoader.js';
import { DefaultResourceLoader } from './resourceLoader.js';

let directory: string;

beforeEach(() => {
  const temporaryRoot = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  directory = fs.mkdtempSync(path.join(temporaryRoot, 'sdk-resources-'));
  const home = path.join(directory, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', directory); vi.stubEnv('GIT_CEILING_DIRECTORIES', directory);
});

afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

function makeLoader(options: ConstructorParameters<typeof DefaultResourceLoader>[0]) {
  return new DefaultResourceLoader({ cwd: directory, noSkills: true, noThemes: true, ...options });
}

function host(label: string) {
  const messages: unknown[] = [];
  const entries: unknown[] = [];
  const notifications: string[] = [];
  const bridge: ExtensionHostBridge = {
    getActiveTools: () => [label + '-active'], getAllTools: () => [label + '-all'], getCommands: () => [label + '-command'],
    sendMessage: value => { messages.push(value); }, appendEntry: (type, data) => { entries.push({ type, data }); },
    ui: { input: async () => label + '-input', notify: message => { notifications.push(message); } },
  };
  return { bridge, messages, entries, notifications };
}

function tool(api: ExtensionAPI, name: string) {
  api.registerTool({ name, description: name, argsSchema: { type: 'object' },
    execute: async () => ({ success: true, output: (await api.getActiveTools()).join(',') }) });
}

describe('SDK resource loader ownership', () => {
  it('permits one initial host binding after reload and refuses replacement of the same collector', async () => {
    let api!: ExtensionAPI;
    const first = host('first'); const second = host('second');
    const loader = makeLoader({ extensionFactories: [value => { api = value; tool(value, 'ready'); }] });
    await loader.reload();
    await expect(api.getActiveTools()).resolves.toEqual([]);
    await expect(api.sendMessage('unbound')).rejects.toThrow('unavailable');
    loader.setHost(first.bridge);
    loader.setHost(first.bridge);
    await expect(api.getActiveTools()).resolves.toEqual(['first-active']);
    await expect(api.getAllTools()).resolves.toEqual(['first-all']);
    await expect(api.getCommands()).resolves.toEqual(['first-command']);
    await expect(api.ui.input('Input')).resolves.toBe('first-input');
    await api.sendMessage('first'); await api.appendEntry('entry', 'first'); api.ui.notify('first');
    expect(() => loader.setHost(second.bridge)).toThrow('Call reload(host) or create a new loader');
    await api.sendMessage('still first');
    expect(first.messages).toEqual(['first', 'still first']);
    expect(first.entries).toEqual([{ type: 'entry', data: 'first' }]);
    expect(first.notifications).toEqual(['first']);
    expect(second.messages).toEqual([]); expect(second.entries).toEqual([]); expect(second.notifications).toEqual([]);
  });

  it('rejects switching a constructor-bound host before loading', () => {
    const first = host('first'); const second = host('second');
    const loader = makeLoader({ host: first.bridge });
    loader.setHost(first.bridge);
    expect(() => loader.setHost(second.bridge)).toThrow('already bound');
  });

  it('creates new closures for an explicit new-host reload and retires every old capability', async () => {
    const apis: ExtensionAPI[] = [];
    const first = host('first'); const second = host('second');
    const loader = makeLoader({ host: first.bridge, extensionFactories: [api => { apis.push(api); tool(api, 'owned'); }] });
    await loader.reload();
    const old = apis[0]!;
    const oldTool = loader.getExtensions().extensions[0]!.extension.tools[0]!;
    await old.sendMessage('first');
    await loader.reload(second.bridge);
    const current = apis[1]!;
    expect(() => old.getActiveTools()).toThrow('retired');
    expect(() => old.sendMessage('late')).toThrow('retired');
    expect(() => old.appendEntry('late', {})).toThrow('retired');
    expect(() => old.ui.notify('late')).toThrow('retired');
    expect(() => old.readWorkspaceFile('note.txt')).toThrow('retired');
    await expect(Promise.resolve().then(() => oldTool.execute({}, {} as never))).rejects.toThrow();
    await expect(current.getActiveTools()).resolves.toEqual(['second-active']);
    await current.sendMessage('second'); current.ui.notify('second');
    expect(first.messages).toEqual(['first']);
    expect(second.messages).toEqual(['second']); expect(second.notifications).toEqual(['second']);
  });

  it('cancels an active tool confirmation on reload and refuses its late successful answer', async () => {
    let answer!: (value: boolean) => void; let entered!: () => void;
    let dialogSignal: AbortSignal | undefined;
    const held = new Promise<boolean>(resolve => { answer = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const confirmations: boolean[] = [];
    const successorConfirm = vi.fn(async () => true);
    const first: ExtensionHostBridge = { ui: { confirm: (_title, _message, options) => {
      dialogSignal = options?.signal; entered(); return held;
    } } };
    const second: ExtensionHostBridge = { ui: { confirm: successorConfirm } };
    const loader = makeLoader({ host: first, extensionFactories: [api => {
      api.registerTool({ name: 'confirm_reload', description: 'Confirm an action', argsSchema: { type: 'object' },
        execute: async () => {
          const confirmed = await api.ui.confirm('Continue', 'Use this resource generation?');
          confirmations.push(confirmed);
          return { success: confirmed, output: confirmed ? 'confirmed' : 'cancelled' };
        } });
    }] });
    await loader.reload();
    const oldTool = loader.getExtensions().extensions[0]!.extension.tools[0]!;
    const pending = Promise.resolve(oldTool.execute({}, { taskId: 'reload-confirmation', workspaceRoot: directory }));
    try {
      await started;
      expect(dialogSignal?.aborted).toBe(false);
      await loader.reload(second);
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(dialogSignal?.aborted).toBe(true);
      expect(confirmations).toEqual([false]);
      await expect(pending).resolves.toMatchObject({ success: false, output: 'cancelled' });
      answer(true);
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(confirmations).toEqual([false]);
      expect(successorConfirm).not.toHaveBeenCalled();
    } finally {
      answer(true);
      await pending.catch(() => {});
    }
  });

  it('cancels an old inline initialization without letting its late completion overwrite new results', async () => {
    let complete!: () => void; let entered!: () => void;
    const held = new Promise<void>(resolve => { complete = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const first = host('first'); const second = host('second');
    const apis: ExtensionAPI[] = []; let calls = 0;
    const loader = makeLoader({ host: first.bridge, extensionFactories: [async api => {
      apis.push(api); calls++;
      if (calls === 1) { entered(); await held; await api.sendMessage('late old send'); }
      tool(api, calls === 1 ? 'old' : 'current');
    }] });
    const oldReload = loader.reload();
    const oldFailure = oldReload.catch(error => error);
    await started;
    await loader.reload(second.bridge);
    expect(await oldFailure).toBeInstanceOf(Error);
    expect(loader.getExtensions().extensions.flatMap(entry => entry.extension.tools).map(value => value.name)).toEqual(['current']);
    complete(); await new Promise<void>(resolve => setImmediate(resolve));
    expect(() => apis[0]!.sendMessage('another late send')).toThrow('retired');
    expect(first.messages).toEqual([]); expect(second.messages).toEqual([]);
    expect(loader.getExtensions().extensions.flatMap(entry => entry.extension.tools).map(value => value.name)).toEqual(['current']);
    expect(loader.getExtensions().errors).toEqual([]);
  });

  it('cancels an old file initialization waiting on a host without using its replacement host', async () => {
    let settle!: (value: string) => void; let entered!: () => void;
    const held = new Promise<string>(resolve => { settle = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const first = host('first'); const second = host('second');
    const firstBridge: ExtensionHostBridge = { ...first.bridge, ui: { input: () => { entered(); return held; } } };
    const file = path.join(directory, 'waiting.ts');
    fs.writeFileSync(file, `export default async api => {
      await api.ui.input('Initialize');
      await api.sendMessage('old file send');
      api.registerTool({ name: 'old_file' });
    };`);
    const loader = makeLoader({ host: firstBridge, additionalExtensionPaths: [file] });
    const oldReload = loader.reload(); const oldFailure = oldReload.catch(error => error);
    await started;
    fs.writeFileSync(file, `export default api => api.registerTool({ name: 'new_file' });`);
    await loader.reload(second.bridge);
    expect(await oldFailure).toBeInstanceOf(Error);
    settle('late'); await new Promise<void>(resolve => setImmediate(resolve));
    expect(first.messages).toEqual([]); expect(second.messages).toEqual([]);
    expect(loader.getExtensions().extensions.flatMap(entry => entry.extension.tools).map(value => value.name)).toEqual(['new_file']);
  });

  it('revokes a previously initialized extension if later resource projection fails', async () => {
    let api!: ExtensionAPI;
    const bound = host('bound');
    const loader = makeLoader({ host: bound.bridge, extensionFactories: [value => { api = value; tool(value, 'ready'); }],
      systemPromptOverride: () => { throw new Error('prompt projection failed'); } });
    await expect(loader.reload()).rejects.toThrow('prompt projection failed');
    expect(loader.getExtensions()).toEqual({ extensions: [], errors: [] });
    expect(() => api.sendMessage('late')).toThrow('retired');
    expect(bound.messages).toEqual([]);
  });

  it('never runs arbitrary error getters or string conversion while returning diagnostics', async () => {
    let getterCalls = 0; let conversions = 0;
    const malicious = { get message() { getterCalls++; return 'private'; }, toString() { conversions++; return 'private'; } };
    const native = new Error();
    Object.defineProperty(native, 'message', { get() { getterCalls++; return 'private'; } });
    const loader = makeLoader({ extensionFactories: [() => { throw malicious; }, () => { throw native; },
      () => { throw new Error('token=PRIVATE_VALUE failed'); }] });
    await loader.reload();
    const errors = loader.getExtensions().errors;
    expect(errors.slice(0, 2).map(value => value.error)).toEqual(['Extension initialization failed.', 'Extension initialization failed.']);
    expect(errors[2]!.error).not.toContain('PRIVATE_VALUE');
    expect(getterCalls).toBe(0); expect(conversions).toBe(0);
  });
});
