import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cliExtensionArguments } from '../../cli/options/extensions.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { inventoryDigest } from '../archive/inventory.js';
import { rootSignature } from '../lifecycle/grants.js';
import type { PackageRecord, VersionRecord } from '../model.js';
import { digest, manifest } from '../registry/validation.js';
import { ExtensionService } from '../service.js';
import { ExtensionStore, storageIdentity, versionPath } from '../store/state.js';
import { executeInProcessScript } from './inProcessLoader.js';
import { installedOptions, scriptOptions } from './options.js';

let scratch: string;
let root: string;
beforeEach(() => {
  const temp = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(temp, { recursive: true });
  scratch = fs.mkdtempSync(path.join(temp, 'installed-flags-'));
  root = path.join(scratch, 'workspace');
  fs.mkdirSync(root);
});
afterEach(() => fs.rmSync(scratch, { recursive: true, force: true }));

const definition = { name: 'installed-label', type: 'string', default: 'fallback' } as const;
const descriptor = { schema: 1, name: 'flagged', version: '1.0.0', permissions: { workspace: 'read', network: 'none' },
  scripts: [{ name: 'main', path: 'main.ts' }], skills: [], commands: [], tools: [], flags: [{ ...definition, script: 'main' }] };

function installFixture(body: string, shortcut = false) {
  const store = new ExtensionStore(path.join(scratch, 'registry.json'));
  const packageManifest = manifest(shortcut ? { ...descriptor, flags: [],
    commands: [{ name: 'installed-action', description: 'Run installed action', script: 'main' }] } : descriptor);
  const text = JSON.stringify(packageManifest);
  const inventory = { files: { 'main.ts': digest(body), 'extension.json': digest(text) }, directories: [] };
  const candidate = { ...inventory, manifest: packageManifest, digest: inventoryDigest(inventory), origin: 'local', source: 'local' } as const;
  const directory = versionPath({ ...candidate, storage: [] }, store.file);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'extension.json'), text);
  fs.writeFileSync(path.join(directory, 'main.ts'), body);
  const active: VersionRecord = { ...candidate, storage: storageIdentity(directory) };
  const record: PackageRecord = { name: 'flagged', active, history: [],
    activation: { [root]: { enabled: true, workspaceIdentity: rootSignature(root),
      grants: ['script:main', ...(shortcut ? ['command:installed-action'] : [])] } } };
  store.publish({ ...store.read(), packages: [record] }, { effect: 'saved', detail: 'fixture' });
  return { store, record, file: path.join(directory, 'main.ts') };
}

it('validates an installed flag and supplies its exact startup value to the owning worker', async () => {
  const { store, record, file } = installFixture(`export default api => {
    api.registerFlag(${JSON.stringify(definition)});
    api.on('session_start', async () => { await api.sendMessage(api.getFlag('installed-label')); });
  };`);
  const [option] = installedOptions(root, store);
  expect(option?.flag).toEqual({ ...definition, script: 'main' });
  const finalize = vi.fn();
  const args = cliExtensionArguments([{ name: '--installed-label', inline: 'chosen' }], finalize);
  args.validate([option!]);
  expect(finalize).toHaveBeenCalledWith(new Map([['--installed-label', 'string']]));
  const sendMessage = vi.fn();
  const flags = scriptOptions(record, store.file, 'main', [{ option: option!, value: args.value(option!)! }]);
  const result = await executeInProcessScript({ root, record: record.active, scriptFile: file, argv: [], denyRules: () => [],
    context: { workspaceRoot: root, taskId: 'flags' }, flags, host: { sendMessage },
    invoke: { kind: 'event', event: 'session_start', payload: { type: 'session_start' } },
  });
  expect(result.success).toBe(true);
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith('chosen');
  store.publish({ ...store.read(), packages: [{ ...record, activation: {} }] }, { effect: 'saved', detail: 'retired' });
  expect(() => option!.check()).toThrow('option source changed');
  expect(installedOptions(root, store)).toEqual([]);
});

it('refuses a worker whose runtime registration differs from the reviewed flag declaration', async () => {
  const { record, file } = installFixture(`export default api => {
    try { api.registerFlag({ name: 'installed-label', type: 'boolean', default: true }); } catch {}
    api.on('session_start', async () => { await api.sendMessage('ran'); });
  };`);
  const sendMessage = vi.fn();
  const result = await executeInProcessScript({ root, record: record.active, scriptFile: file, argv: [], denyRules: () => [],
    context: { workspaceRoot: root, taskId: 'flags' }, flags: [{ definition, value: 'chosen' }], host: { sendMessage },
    invoke: { kind: 'event', event: 'session_start', payload: { type: 'session_start' } },
  });
  expect(result.success).toBe(false);
  expect(sendMessage).not.toHaveBeenCalled();
});

it('requires each installed flag to name a declared JS or TS script', () => {
  expect(() => manifest({ ...descriptor, flags: [{ ...definition, script: 'missing' }] })).toThrow('declared JavaScript or TypeScript script');
  expect(() => manifest({ ...descriptor, flags: [{ ...definition, script: 'main' }, { ...definition, script: 'main' }] })).toThrow('Duplicate extension capability');
});

it('publishes an installed worker shortcut through the ordinary execution gate and retires it with its grant', async () => {
  const { record, store } = installFixture(`export default api => {
    api.registerCommand({ name: 'installed-action', description: 'Run installed action', execute: async () => {
      await api.sendMessage('shortcut ran'); return 'complete';
    } });
    api.registerShortcut({ key: 'ctrl+alt+j', command: 'installed-action' });
  };`, true);
  let allow = true;
  const approval = vi.fn(async () => ({ decision: allow ? 'allow-once' as const : 'deny' as const }));
  const sendMessage = vi.fn();
  const service = new ExtensionService({ root, store, check: () => {}, offline: () => false, denyRules: () => [],
    assertWorkspace: () => {}, extensionHost: { sendMessage }, gate: () => ({ sessionId: 'installed-shortcuts', workspaceRoot: root,
      permissionScope: 'ask', hooks: new HookDispatcher(), emit: () => {}, escalationPromptHandler: approval }),
  });
  try {
    expect(service.shortcut('ctrl+alt+j')).toBeUndefined();
    await service.run('flagged', 'main', []);
    const press = service.shortcut('ctrl+alt+j');
    expect(press).toBeTypeOf('function');
    const signal = new AbortController().signal;
    allow = false;
    await expect(press!(signal)).rejects.toThrow('shortcut did not complete');
    expect(sendMessage).not.toHaveBeenCalled();
    allow = true;
    await press!(signal);
    expect(sendMessage).toHaveBeenCalledExactlyOnceWith('shortcut ran');
    const activation = record.activation[root]!;
    store.publish({ ...store.read(), packages: [{ ...record, activation: { [root]: { ...activation, grants: ['script:main'] } } }] },
      { effect: 'saved', detail: 'revoked command' });
    await service.invalidate();
    expect(service.shortcut('ctrl+alt+j')).toBeUndefined();
    await expect(press!(signal)).rejects.toThrow('shortcut did not complete');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  } finally { await service.close(); }
});

it.each(['removed', 'rebound', 'equivalent'])('revalidates the %s shortcut in the approved worker', async changed => {
  const { store } = installFixture(`export default async api => {
    api.registerCommand({ name: 'installed-action', description: 'Run installed action', execute: async () => {
      await api.sendMessage('shortcut ran'); return 'complete';
    } });
    const binding = await api.ui.input('Shortcut binding');
    if (binding === 'original') api.registerShortcut({ key: 'ctrl+alt+j', command: 'installed-action' });
    if (binding === 'equivalent') api.registerShortcut({ key: ' Alt + Ctrl + J ', command: 'installed-action' });
    if (binding === 'rebound') api.registerShortcut({ key: 'ctrl+alt+j', command: 'different-action' });
  };`, true);
  let binding = 'original';
  const sendMessage = vi.fn();
  const approve = vi.fn(async () => ({ decision: 'allow-once' as const }));
  const registeredBinding = vi.fn(async () => binding);
  const service = new ExtensionService({ root, store, check: () => {}, offline: () => false, denyRules: () => [],
    assertWorkspace: () => {}, extensionHost: { sendMessage, ui: { input: registeredBinding } },
    gate: () => ({ sessionId: 'installed-shortcuts', workspaceRoot: root, permissionScope: 'ask',
      hooks: new HookDispatcher(), emit: () => {}, escalationPromptHandler: approve }),
  });
  try {
    await service.run('flagged', 'main', []);
    const press = service.shortcut('ctrl+alt+j');
    expect(press).toBeTypeOf('function');
    const signal = new AbortController().signal;
    approve.mockClear();
    registeredBinding.mockClear();
    binding = changed;
    if (changed === 'equivalent') {
      await press!(signal);
      expect(sendMessage).toHaveBeenCalledExactlyOnceWith('shortcut ran');
    } else {
      await expect(press!(signal)).rejects.toThrow('shortcut did not complete');
      expect(sendMessage).not.toHaveBeenCalled();
    }
    expect(approve).toHaveBeenCalledOnce();
    expect(registeredBinding).toHaveBeenCalledWith('Shortcut binding', undefined, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  } finally { await service.close(); }
});
