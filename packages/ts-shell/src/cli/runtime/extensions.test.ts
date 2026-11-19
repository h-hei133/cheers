import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { configurationAdmission, initialConfiguration } from '../../core/shell/configuration.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import { closeExtensionsFor, extensionManagerFor, installExtensionRuntime, isExtensionControl, waitForExtensionsFor } from './extensions.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { catalogContributions } from '../../core/catalog/contributions.js';
import { bindExtensionUiFor, extensionHostFor } from './extensions/host.js';
import { createProfileContext, withProfile } from '../../core/paths/profile/context.js';
import { sessionModelCatalog, sessionVirtualModels } from '../../core/catalog/models.js';
import { scanCliArgs } from '../options/argv.js';
import { cliExtensionArguments, type CliExtensionArguments } from '../options/extensions.js';

let directory: string; let context: ShellRuntimeContext;
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true });
  directory = fs.mkdtempSync(path.join(temporary, 'extension-view-'));
  vi.stubEnv('HOME', path.join(directory, 'home')); vi.stubEnv('USERPROFILE', path.join(directory, 'home'));
  vi.stubEnv('CHEERS_MARKETPLACES_FILE', path.join(directory, 'sources.json'));
  vi.stubEnv('CHEERS_EXTENSIONS_FILE', path.join(directory, 'registry.json'));
  const seed = { cwd: directory, projectRoot: directory, session: { id: 'view', createdAt: '2026-10-21', projectRoot: directory },
    runtimeConfig: getRuntimeConfig(directory) };
  context = { ...seed, configuration: initialConfiguration(seed) } as ShellRuntimeContext;
});
afterEach(async () => { await closeExtensionsFor(context); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); });

function install(args?: CliExtensionArguments) {
  const commands = new ShellCommandRuntime();
  const runtime = { commands, getPermissionScope: () => 'ask', input: () => undefined, executePrompt: vi.fn(async () => 'ran') } as unknown as ShellSessionRuntime;
  installExtensionRuntime(context, runtime, () => ({ sessionId: 'view', workspaceRoot: directory,
    hooks: new HookDispatcher(), emit: () => {}, permissionScope: 'ask' }), undefined, undefined, args);
  return commands;
}

it('uses typed CLI flags during factory initialization and preserves false, empty and default values', async () => {
  const file = path.join(directory, 'flags.ts');
  fs.writeFileSync(file, `export default async api => {
    const declaration = { name: 'enabled', type: 'boolean', default: true };
    api.registerFlag(declaration);
    declaration.name = 'changed';
    api.registerFlag({ name: 'tag' });
    api.registerFlag({ name: 'extra', default: 'fallback' });
    await Promise.resolve();
    const values = [api.getFlag('enabled'), api.getFlag('tag'), api.getFlag('extra'), api.getFlag('changed')];
    let refused = false;
    try { await api.sendMessage('No automatic startup prompt'); } catch { refused = true; }
    api.registerCommand({ name: 'show-flags', description: 'Read admitted values', execute: () => ({
      kind: 'local', output: JSON.stringify({ values, refused })
    }) });
  };`);
  context.cliExtensionPaths = [file];
  const finalize = vi.fn();
  install(cliExtensionArguments(scanCliArgs(['--enabled=false', '--tag=']).unresolved, finalize));
  await waitForExtensionsFor(context);
  expect(finalize).toHaveBeenCalledOnce();
  const command = catalogContributions(directory, 'view').flatMap(entry => entry.commands)[0]!;
  expect(await command.execute([], { cwd: directory, sessionId: 'view' })).toEqual({
    kind: 'local', output: JSON.stringify({ values: [false, '', 'fallback', null], refused: true }),
  });
});

it.each([
  { declarations: ['model'], wanted: [], message: 'reserved' },
  { declarations: ['same', 'same'], wanted: [], message: 'declared more than once' },
  { declarations: ['first'], wanted: ['--missing', 'NO_PROMPT'], message: 'not registered' },
  { declarations: ['first'], wanted: ['--first'], message: 'Missing value' },
])('withholds a generation before publishing for $message', async ({ declarations, wanted, message }) => {
  context.cliExtensionPaths = declarations.map((name, index) => {
    const target = path.join(directory, `flags-${index}.ts`);
    fs.writeFileSync(target, `export default api => {
      api.registerFlag({ name: ${JSON.stringify(name)} });
      api.registerTool({ name: 'staged_${index}' });
    };`);
    return target;
  });
  const finalize = vi.fn();
  install(wanted.length ? cliExtensionArguments(scanCliArgs(wanted).unresolved, finalize) : undefined);
  await expect(waitForExtensionsFor(context)).rejects.toThrow(message);
  expect(finalize).not.toHaveBeenCalled();
  expect(catalogContributions(directory, 'view')).toEqual([]);
});

it('denies a second declaration before its initializer can read the invoked flag value', async () => {
  const first = path.join(directory, 'first-owner.ts'), second = path.join(directory, 'second-owner.ts');
  fs.writeFileSync(first, `export default api => api.registerFlag({name:'label', default:'FIRST_DEFAULT'});`);
  fs.writeFileSync(second, `export default api => {
    try { api.registerFlag({ name:'label', default:'SECOND_DEFAULT' }); } catch {}
    const value = api.getFlag('label');
    if (value !== undefined) throw new Error('Second extension received a flag value.');
  };`);
  context.cliExtensionPaths = [first, second];
  const finalize = vi.fn();
  install(cliExtensionArguments(scanCliArgs(['--label=FIRST_EXPLICIT']).unresolved, finalize));
  await expect(waitForExtensionsFor(context)).rejects.toThrow('declared more than once');
  expect(finalize).not.toHaveBeenCalled();
  expect(catalogContributions(directory, 'view')).toEqual([]);
});

it('awaits async file factories before publishing complete CLI contributions', async () => {
  const file = path.join(directory, 'extension.ts');
  fs.writeFileSync(file, `export default async api => {
    await Promise.resolve();
    api.registerTool({ name: 'initialized_tool', description: 'Ready', argsSchema: { type: 'object' }, execute: async () => ({ success: true, output: 'ok' }) });
  };`);
  context.cliExtensionPaths = [file];
  install();
  expect(catalogContributions(directory, 'view').flatMap(entry => entry.tools)).toEqual([]);
  await waitForExtensionsFor(context);
  expect(catalogContributions(directory, 'view').flatMap(entry => entry.tools).map(tool => tool.name)).toEqual(['initialized_tool']);
});

it('withholds every CLI contribution when a later async factory rejects', async () => {
  const first = path.join(directory, 'first.ts');
  const second = path.join(directory, 'second.ts');
  fs.writeFileSync(first, `export default api => api.registerTool({ name: 'partial_tool' });`);
  fs.writeFileSync(second, `export default async () => { await Promise.resolve(); throw new Error('factory failed'); };`);
  context.cliExtensionPaths = [first, second];
  install();
  await expect(waitForExtensionsFor(context)).rejects.toThrow('factory failed');
  expect(catalogContributions(directory, 'view').flatMap(entry => entry.tools)).toEqual([]);
});

it('publishes complete async file virtual metadata and retires its captured callback on close', async () => {
  const file = path.join(directory, 'virtual.ts');
  fs.writeFileSync(file, `export default async api => {
    api.registerVirtualModel({ provider: 'adaptive', id: 'first', name: 'First', thinkingLevels: ['low', 'high'],
      route: request => ({ provider: 'openai', modelId: 'physical', state: { count: (request.state?.count ?? 0) + 1 } }) });
    await Promise.resolve();
    api.registerVirtualModel({ provider: 'adaptive', id: 'second', name: 'Second', route: () => ({ provider: 'openai', modelId: 'physical' }) });
  };`);
  context.cliExtensionPaths = [file]; install();
  expect(sessionVirtualModels(directory, 'view')).toEqual([]);
  await waitForExtensionsFor(context);
  const models = sessionVirtualModels(directory, 'view'); const physical = context.configuration.current.catalog;
  expect(models.map(model => model.id)).toEqual(['first', 'second']);
  const catalog = sessionModelCatalog(directory, 'view', physical);
  expect(catalog.physical).toBe(physical);
  expect(catalog.virtual).toEqual([{ provider: 'adaptive', id: 'first', name: 'First', thinkingLevels: ['low', 'high'] },
    { provider: 'adaptive', id: 'second', name: 'Second' }]);
  expect(catalog.virtual.every(model => !Object.hasOwn(model, 'route'))).toBe(true);
  await expect(models[0]!.route({ provider: 'adaptive', modelId: 'first', thinkingLevel: 'high', reason: 'direct',
    messages: [], state: { count: 3 } })).resolves.toMatchObject({ state: { count: 4 } });
  await closeExtensionsFor(context); expect(sessionVirtualModels(directory, 'view')).toEqual([]);
  await expect(models[0]!.route({ provider: 'adaptive', modelId: 'first', thinkingLevel: 'high', reason: 'direct', messages: [] }))
    .rejects.toThrow(/retired/);
});

it('withholds staged virtual models and tools when a later async file factory rejects', async () => {
  const first = path.join(directory, 'virtual-first.ts'); const second = path.join(directory, 'virtual-second.ts');
  fs.writeFileSync(first, `export default async api => {
    await Promise.resolve();
    api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic', route: () => ({ provider: 'openai', modelId: 'physical' }) });
    api.registerTool({ name: 'staged_virtual_tool' });
  };`);
  fs.writeFileSync(second, `export default async api => {
    api.registerVirtualModel({ provider: 'adaptive', id: 'late', name: 'Late', route: () => ({ provider: 'openai', modelId: 'physical' }) });
    await Promise.resolve(); throw new Error('later virtual factory failed');
  };`);
  context.cliExtensionPaths = [first, second]; install();
  await expect(waitForExtensionsFor(context)).rejects.toThrow('later virtual factory failed');
  expect(catalogContributions(directory, 'view')).toEqual([]); expect(sessionVirtualModels(directory, 'view')).toEqual([]);
});

it('cleans earlier CLI registrations when a later virtual model collides with the physical catalog', async () => {
  const physical = context.configuration.current.catalog.flatMap(provider => provider.models.map(model => ({ provider: provider.id, model: model.id })))[0]!;
  expect(physical).toBeDefined();
  const first = path.join(directory, 'before-collision.ts'); const second = path.join(directory, 'physical-collision.ts');
  fs.writeFileSync(first, `export default async api => {
    await Promise.resolve();
    api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic', route: () => ({ provider: 'openai', modelId: 'physical' }) });
    api.registerTool({ name: 'before_collision' });
  };`);
  fs.writeFileSync(second, `export default async api => {
    await Promise.resolve();
    api.registerVirtualModel({ provider: ${JSON.stringify(physical.provider)}, id: ${JSON.stringify(physical.model)}, name: 'Collision',
      route: () => ({ provider: 'openai', modelId: 'physical' }) });
  };`);
  context.cliExtensionPaths = [first, second]; install();
  await expect(waitForExtensionsFor(context)).rejects.toThrow(/physical/);
  expect(catalogContributions(directory, 'view')).toEqual([]);
  expect(sessionModelCatalog(directory, 'view', context.configuration.current.catalog).virtual).toEqual([]);
});

it('exposes only the installed runtime and shares aliases without legacy fallback', () => {
  expect(extensionManagerFor(context)).toBeUndefined();
  install();
  expect(extensionManagerFor(context)!.read()).toMatchObject({ state: 'ready', snapshot: { items: [] } });
  for (const alias of ['plugin', 'plugins', 'extensions']) {
    expect(isExtensionControl(`/${alias} list`)).toBe(true);
    expect(isExtensionControl(`/${alias} cancel`)).toBe(true);
    expect(isExtensionControl(`/${alias} install source:one@1.0.0`)).toBe(false);
  }
});

it('captures binding and configuration admission, allows same-binding metadata refresh and refuses a root rebind', () => {
  install(); const view = extensionManagerFor(context)!;
  context.session = { ...context.session };
  expect(view.read().state).toBe('ready');
  context.cwd = path.join(directory, 'other'); fs.mkdirSync(context.cwd);
  expect(view.read()).toEqual({ state: 'stale' });
  context.cwd = directory;
  context.workspaceRevision = (context.workspaceRevision ?? 0) + 1;
  expect(view.read()).toEqual({ state: 'stale' });
});

it('keeps corrupt installation state unavailable and captures command cancellation before preparation', async () => {
  const commands = install();
  fs.writeFileSync(path.join(directory, 'registry.json'), '{');
  expect(extensionManagerFor(context)!.read()).toEqual({ state: 'unavailable' });
  fs.unlinkSync(path.join(directory, 'registry.json'));
  const view = extensionManagerFor(context)!; const current = view.read();
  if (current.state !== 'ready') throw new Error('Missing fixture snapshot');
  const pending = view.prepare(current.snapshot.version, { action: current.snapshot.install.id, input: 'source:one@1.0.0' });
  commands.current!.controller.abort();
  await expect(pending).rejects.toThrow();
  expect(fs.existsSync(path.join(directory, 'registry.json'))).toBe(false);
});

it.each(['unchanged', 'replaced'] as const)('settles a pending custom-host answer with its profile owner %s', async owner => {
  const profile = createProfileContext({ homeDir: directory, name: 'dialog', env: {} });
  withProfile(profile, () => {
    const seed = { ...context, profile, runtimeConfig: getRuntimeConfig(directory) };
    context = { ...seed, configuration: initialConfiguration(seed) };
    install();
    expect(configurationAdmission(context)()).toBeUndefined();
  });
  let answer!: (value: boolean) => void;
  let signal: AbortSignal | undefined;
  withProfile(profile, () => bindExtensionUiFor(context, { confirm: (_title, _message, options) => {
    signal = options?.signal;
    return new Promise(resolve => { answer = resolve; });
  } }));
  const pending = withProfile(profile, () => extensionHostFor(context)!.ui!.confirm!('Continue', 'Use this session?'));
  await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
  if (owner === 'replaced') {
    fs.renameSync(profile.root, `${profile.root}-old`);
    fs.mkdirSync(profile.root);
  }
  expect(signal?.aborted).toBe(false);
  answer(true);
  expect(await pending).toBe(owner === 'unchanged');
});
