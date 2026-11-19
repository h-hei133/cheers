import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Skill } from '../../core/skills/skillLoader.js';
import type { ExtensionAPI, ExtensionHostBridge } from '../../extensions/runtime/inProcessLoader.js';
import { captureThemes } from './snapshot.js';
import { DefaultResourceLoader, type LoadedSdkExtension, type LoadExtensionsResult, type ResourceDiagnostic, type ResourceReloadReceipt } from '../resourceLoader.js';

let directory: string;

beforeEach(() => {
  const temporaryRoot = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  directory = fs.mkdtempSync(path.join(temporaryRoot, 'sdk-generation-'));
  const home = path.join(directory, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', directory); vi.stubEnv('GIT_CEILING_DIRECTORIES', directory);
});

afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

function makeLoader(options: ConstructorParameters<typeof DefaultResourceLoader>[0] = {}) {
  return new DefaultResourceLoader({ cwd: directory, noSkills: true, noThemes: true, ...options });
}

function host(label: string) {
  const messages: unknown[] = [];
  const bridge: ExtensionHostBridge = {
    getActiveTools: () => [label],
    sendMessage: message => { messages.push(message); },
    ui: { input: async () => label },
  };
  return { bridge, messages };
}

function tool(api: ExtensionAPI, name: string) {
  api.registerTool({ name, description: name, argsSchema: { type: 'object' },
    execute: async () => ({ success: true, output: name }) });
}

function names(receipt: ResourceReloadReceipt) {
  return receipt.snapshot.extensions.extensions.flatMap(entry => entry.extension.tools).map(value => value.name);
}

describe('SDK guarded resource generations', () => {
  it('keeps controlled initialization unbound even when legacy setHost tries to reclaim the old host', async () => {
    const bound = host('bound'); const successor = host('successor');
    let calls = 0, entered!: () => void, complete!: () => void, initializationSend: unknown;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { complete = resolve; });
    const loader = makeLoader({ host: bound.bridge, extensionFactories: [async api => {
      if (++calls === 2) {
        entered(); await held;
        try { await api.sendMessage('initializer must stay unbound'); } catch (error) { initializationSend = error; }
      }
      tool(api, `owned_${calls}`);
    }] });
    await loader.reload(); const lease = loader.captureReload(); lease.retireForReload(bound.bridge);
    const pending = lease.reload();
    try {
      await started;
      expect(() => loader.setHost(bound.bridge)).toThrow('receipt');
      complete();
      const receipt = await pending;
      expect(initializationSend).toBeInstanceOf(Error); expect(bound.messages).toEqual([]);
      expect(() => loader.setHost(successor.bridge)).toThrow('receipt');
      receipt.bind(successor.bridge); receipt.assertCurrent(successor.bridge); receipt.retire();
    } finally { complete(); await pending.catch(() => {}); }
  });

  it('owns override skill text, diagnostics and source records after receipt publication', async () => {
    const bound = host('bound');
    let current = true; const isCurrent = () => current;
    const skill = { name: 'captured', description: 'Captured description', body: 'Captured body', filePath: 'captured.md',
      source: 'cli' as const, disableModelInvocation: false, unhonouredFields: ['captured-field'], isCurrent };
    const diagnostic = { kind: 'warning' as const, path: 'captured.md', message: 'Captured diagnostic' };
    const error = { path: 'captured.ts', error: 'Captured extension error' };
    const skills: Skill[] = [skill]; const diagnostics: ResourceDiagnostic[] = [diagnostic];
    let entry!: LoadedSdkExtension;
    const loader = makeLoader({ host: bound.bridge, extensionFactories: [api => { tool(api, 'owned'); }],
      skillsOverride: () => ({ skills, diagnostics }),
      extensionsOverride: base => { entry = { source: 'captured.ts', extension: base.extensions[0]!.extension };
        return { extensions: [entry], errors: [error] }; } });
    await loader.reload(); const lease = loader.captureReload(); lease.retireForReload(bound.bridge);
    const receipt = await lease.reload(); const extension = entry.extension;
    skill.name = 'mutated'; skill.body = 'Mutated body'; skill.description = 'Mutated description';
    skill.isCurrent = () => false;
    skill.unhonouredFields.push('mutated-field'); diagnostic.message = 'Mutated diagnostic'; diagnostic.path = 'mutated.md';
    error.error = 'Mutated extension error'; error.path = 'mutated.ts';
    Object.assign(entry, { source: 'mutated.ts' }); skills.splice(0); diagnostics.splice(0);
    expect(receipt.snapshot.skills.skills[0]).toMatchObject({ name: 'captured', body: 'Captured body', description: 'Captured description',
      unhonouredFields: ['captured-field'] });
    expect(receipt.snapshot.skills.diagnostics).toEqual([{ kind: 'warning', path: 'captured.md', message: 'Captured diagnostic' }]);
    expect(receipt.snapshot.extensions.errors).toEqual([{ path: 'captured.ts', error: 'Captured extension error' }]);
    expect(receipt.snapshot.extensions.extensions[0]!.source).toBe('captured.ts');
    expect(receipt.snapshot.extensions.extensions[0]!.extension.tools[0]!.execute).toBe(extension.tools[0]!.execute);
    expect(Object.isFrozen(receipt.snapshot.skills.skills[0])).toBe(true);
    expect(receipt.snapshot.skills.skills[0]!.isCurrent).toBe(isCurrent);
    expect(receipt.snapshot.skills.skills[0]!.isCurrent!()).toBe(true); current = false;
    expect(receipt.snapshot.skills.skills[0]!.isCurrent!()).toBe(false);
    receipt.retire();
  });

  it('owns extension metadata and handler membership while preserving captured callback functions', async () => {
    const bound = host('bound');
    const argsSchema = { type: 'object', properties: { value: { type: 'string' } } };
    const shortcut = { key: 'ctrl+k', description: 'Captured shortcut', run: () => {} };
    const flag = { name: 'captured', description: 'Captured flag', type: 'boolean' as const, default: true };
    let original!: LoadedSdkExtension;
    const loader = makeLoader({ host: bound.bridge,
      extensionFactories: [api => {
        api.registerTool({ name: 'captured_tool', description: 'Captured tool', argsSchema,
          execute: async () => ({ success: true, output: 'Captured' }) });
        api.registerShortcut(shortcut); api.registerFlag(flag);
        api.on('session_start', () => {});
        api.registerVirtualModel({ provider: 'captured', id: 'captured', name: 'Captured',
          route: async () => ({ provider: 'physical', modelId: 'captured' }) });
      }], extensionsOverride: base => { original = base.extensions[0]!; return base; } });
    await loader.reload(); const lease = loader.captureReload(); lease.retireForReload(bound.bridge);
    const receipt = await lease.reload(); const source = original.extension;
    const execute = source.tools[0]!.execute, handler = source.handlers.get('session_start')![0]!, route = source.virtualModels![0]!.route;
    argsSchema.properties.value.type = 'number'; shortcut.description = 'Mutated shortcut'; flag.default = false;
    Object.assign(source.tools[0]!, { name: 'mutated_tool' });
    (source.handlers as Map<string, readonly ((payload: unknown) => unknown)[]>).clear();
    Object.assign(source, { tools: [], virtualModels: [] });
    const captured = receipt.snapshot.extensions.extensions[0]!.extension;
    expect(captured.tools[0]).toMatchObject({ name: 'captured_tool', argsSchema: { properties: { value: { type: 'string' } } } });
    expect(captured.tools[0]!.execute).toBe(execute); expect(captured.handlers.get('session_start')![0]).toBe(handler);
    expect(captured.virtualModels![0]!.route).toBe(route);
    expect(captured.shortcuts[0]!.description).toBe('Captured shortcut'); expect(captured.flags[0]!.default).toBe(true);
    expect('set' in captured.handlers).toBe(false); expect('clear' in captured.handlers).toBe(false);
    const audience: string[] = [];
    captured.handlers.forEach(function (this: string[], _listeners, key, map) {
      this.push(key); expect(map).toBe(captured.handlers);
    }, audience);
    expect(audience).toEqual(['session_start']);
    expect(Object.isFrozen(captured.tools[0]!.argsSchema)).toBe(true); receipt.retire();
  });

  it('can recapture a previously returned extension snapshot without borrowing arbitrary map methods', async () => {
    const bound = host('bound'); const signal = new AbortController().signal;
    const execute = async () => ({ success: true, output: 'captured' });
    const resources: LoadExtensionsResult = { extensions: [{ source: 'captured.ts', extension: {
      tools: [{ name: 'captured', description: 'Captured', argsSchema: { type: 'object' }, execute }],
      commands: [], shortcuts: [], flags: [], virtualModels: [], signal,
      handlers: new Map([['session_start', [() => {}]]]),
      events: { on: () => () => {}, once: () => () => {}, off: () => {}, emit: () => {} },
      readWorkspaceFile: () => '', exports: {},
    } }], errors: [] };
    let previous: LoadExtensionsResult | undefined;
    const loader = makeLoader({ host: bound.bridge, extensionsOverride: () => previous ?? resources });
    await loader.reload(); previous = loader.getExtensions();
    await loader.reload(bound.bridge);
    expect(loader.getExtensions().extensions[0]!.extension.tools[0]!.execute).toBe(execute);
    expect(loader.getExtensions().extensions[0]!.extension.handlers.has('session_start')).toBe(true);
    expect(signal.aborted).toBe(false);
    loader.captureRetirement()();
  });

  it('preserves opaque nested callbacks and classes exported by a resource generation', async () => {
    const exports = { nested: { callback: () => 'captured' }, Exported: class { value = 'captured'; } };
    const loader = makeLoader({ extensionsOverride: () => ({ extensions: [{ source: 'exports.ts', extension: {
      tools: [], commands: [], virtualModels: [], shortcuts: [], flags: [], handlers: new Map(),
      events: { on: () => () => {}, once: () => () => {}, off: () => {}, emit: () => {} },
      readWorkspaceFile: () => '', exports,
    } }], errors: [] }) });
    await loader.reload();
    const captured = loader.getExtensions().extensions[0]!.extension.exports;
    expect(captured).toBe(exports);
    expect((captured.nested as typeof exports.nested).callback()).toBe('captured');
    expect(new (captured.Exported as typeof exports.Exported)().value).toBe('captured');
    expect(Object.isFrozen(exports)).toBe(false); loader.captureRetirement()();
  });

  it('captures override slots without executing source getters, proxies or custom array iterators', async () => {
    let getters = 0, iterators = 0, traps = 0;
    const accessor = Object.create(null);
    Object.defineProperty(accessor, 'name', { get() { getters++; throw new Error('Private getter content'); } });
    const iteratorSkills = [accessor];
    Object.defineProperty(iteratorSkills, Symbol.iterator, { value() { iterators++; return [][Symbol.iterator](); } });
    const loader = makeLoader({ skillsOverride: () => ({ skills: iteratorSkills, diagnostics: [] }) });
    await expect(loader.reload()).rejects.toThrow('array is invalid');
    expect(iterators).toBe(0); expect(getters).toBe(0);
    const getterLoader = makeLoader({ skillsOverride: () => ({ skills: [accessor], diagnostics: [] }) });
    await expect(getterLoader.reload()).rejects.toThrow('accessors'); expect(getters).toBe(0);
    const proxy = new Proxy({}, { ownKeys() { traps++; return []; }, get() { traps++; return undefined; } });
    const proxyLoader = makeLoader({ skillsOverride: () => ({ skills: [proxy as Skill], diagnostics: [] }) });
    await expect(proxyLoader.reload()).rejects.toThrow('inert record'); expect(traps).toBe(0);
  });

  it('captures theme colors and report-safe diagnostics using owned inert records', () => {
    const theme = { name: 'captured', description: 'Captured theme', colors: { accent: '#abcdef' } };
    const diagnostic = { kind: 'warning' as const, path: 'token=SYNTHETIC_PATH', message: 'Authorization: Bearer SYNTHETIC_VALUE' };
    const captured = captureThemes([theme], [diagnostic]);
    theme.colors.accent = '#000000'; diagnostic.message = 'Changed';
    expect(captured.themes[0]!.colors.accent).toBe('#abcdef');
    expect(Object.isFrozen(captured.themes[0]!.colors)).toBe(true);
    expect(captured.diagnostics[0]!.message).not.toContain('SYNTHETIC_VALUE');
    expect(captured.diagnostics[0]!.path).not.toContain('SYNTHETIC_PATH');
  });

  it('loads the captured successor unbound, clears removed resources, then binds its exact host', async () => {
    const first = host('first'); const second = host('second');
    const apis: ExtensionAPI[] = []; let calls = 0; let systemPrompt: string | undefined = 'original';
    let initializingTools: readonly string[] | undefined, messageError: unknown, uiError: unknown;
    let append: readonly string[] = ['original append'];
    let skills: readonly Skill[] = [{ name: 'original', description: 'Original', body: 'Original', filePath: 'original.md',
      source: 'cli', disableModelInvocation: false, unhonouredFields: [] }];
    const loader = makeLoader({ host: first.bridge, noContextFiles: true,
      additionalSkillPaths: ['skills'], additionalThemePaths: ['themes'],
      systemPromptOverride: () => systemPrompt, appendSystemPromptOverride: () => append,
      skillsOverride: () => ({ skills, diagnostics: [] }),
      extensionFactories: [async api => {
        apis.push(api); calls++;
        if (calls > 1) {
          initializingTools = await api.getActiveTools();
          try { await api.sendMessage('initializing'); } catch (error) { messageError = error; }
          try { await api.ui.input('Initialize'); } catch (error) { uiError = error; }
        }
        tool(api, `owned_${calls}`);
      }] });
    await loader.reload();
    const lease = loader.captureReload(); const oldRelease = loader.captureRetirement();
    lease.assertCurrent(first.bridge);
    expect(() => lease.retireForReload(second.bridge)).toThrow('host changed');
    lease.assertCurrent(first.bridge);
    systemPrompt = undefined; append = []; skills = [];
    lease.retireForReload(first.bridge);
    lease.assertCurrent();
    expect(() => lease.assertCurrent(first.bridge)).toThrow('retired');
    expect(() => apis[0]!.sendMessage('retired')).toThrow('retired');
    const receipt = await lease.reload();
    expect(initializingTools).toEqual([]);
    expect(messageError).toBeInstanceOf(Error); expect((messageError as Error).message).toContain('unavailable');
    expect(uiError).toBeInstanceOf(Error); expect((uiError as Error).message).toContain('unavailable');
    receipt.assertCurrent(undefined);
    expect(receipt.snapshot).toMatchObject({ systemPrompt: undefined, appendSystemPrompt: [],
      skills: { skills: [], diagnostics: [] }, themes: { themes: [], diagnostics: [] },
      skillPaths: ['skills'], themePaths: ['themes'], noSkills: true, noContextFiles: true });
    expect(names(receipt)).toEqual(['owned_2']);
    expect(Object.isFrozen(receipt.snapshot)).toBe(true);
    const release = receipt.bind(second.bridge);
    receipt.assertCurrent(second.bridge);
    expect(() => receipt.assertCurrent(undefined)).toThrow('host changed');
    oldRelease();
    await apis[1]!.sendMessage('successor');
    expect(first.messages).toEqual([]); expect(second.messages).toEqual(['successor']);
    const next = receipt.captureReload(); next.assertCurrent(second.bridge);
    release();
    expect(() => next.assertCurrent()).toThrow('retired');
  });

  it('rejects an external replacement before the original consumer retires and preserves it', async () => {
    const first = host('first'); const external = host('external');
    const apis: ExtensionAPI[] = [];
    const loader = makeLoader({ host: first.bridge, extensionFactories: [api => { apis.push(api); }] });
    await loader.reload(); const lease = loader.captureReload();
    await loader.reload(external.bridge);
    expect(() => lease.assertCurrent(first.bridge)).toThrow('generation changed');
    expect(() => lease.retireForReload(first.bridge)).toThrow('generation changed');
    await apis[1]!.sendMessage('external'); expect(external.messages).toEqual(['external']);
    loader.captureRetirement()();
  });

  it('retains publication identity across original release, external reload and external release', async () => {
    const first = host('first'); const external = host('external'); let calls = 0;
    const loader = makeLoader({ host: first.bridge, extensionFactories: [() => { calls++; }] });
    await loader.reload(); const lease = loader.captureReload();
    lease.retireForReload(first.bridge); lease.assertCurrent();
    await loader.reload(external.bridge); loader.captureRetirement()();
    expect(() => lease.assertCurrent()).toThrow('reservation changed');
    await expect(lease.reload()).rejects.toThrow('reservation changed');
    expect(calls).toBe(2);
  });

  it('ordinary disposal revokes a captured live lease and an intentional reservation', async () => {
    const bound = host('bound');
    const loader = makeLoader({ host: bound.bridge });
    await loader.reload(); const live = loader.captureReload(); const release = loader.captureRetirement();
    release();
    expect(() => live.retireForReload(bound.bridge)).toThrow('retired');
    await expect(live.reload()).rejects.toThrow('intentionally retired');
    await loader.reload(bound.bridge); const reserved = loader.captureReload(); const dispose = loader.captureRetirement();
    reserved.retireForReload(bound.bridge); dispose();
    expect(() => reserved.assertCurrent()).toThrow('retired');
    await expect(reserved.reload()).rejects.toThrow('retired');
  });

  it('allows only one successor despite concurrent reuse and synchronous retirement/admission reentry', async () => {
    const bound = host('bound'); let calls = 0;
    const loader = makeLoader({ host: bound.bridge, extensionFactories: [() => { calls++; }] });
    await loader.reload(); const lease = loader.captureReload();
    let retirementReentry: Promise<unknown> | undefined;
    const extension = loader.getExtensions().extensions[0]!.extension;
    extension.signal!.addEventListener('abort', () => { retirementReentry = lease.reload().catch(error => error); }, { once: true });
    lease.retireForReload(bound.bridge);
    expect(await retirementReentry).toBeInstanceOf(Error);
    let admissionReentry: Promise<unknown> | undefined; let admissions = 0;
    const pending = lease.reload({ admission: () => {
      admissions++; if (admissions === 1) admissionReentry = lease.reload().catch(error => error);
    } });
    const reused = lease.reload().catch(error => error);
    const receipt = await pending;
    expect(await reused).toBeInstanceOf(Error); expect(await admissionReentry).toBeInstanceOf(Error);
    expect(admissions).toBe(2); expect(calls).toBe(2); receipt.retire();
  });

  it('cancels a held initializer without waiting for it or accepting late registration', async () => {
    const bound = host('bound'); const control = new AbortController();
    const apis: ExtensionAPI[] = []; let calls = 0; let complete!: () => void; let entered!: () => void;
    const held = new Promise<void>(resolve => { complete = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const loader = makeLoader({ host: bound.bridge, extensionFactories: [async api => {
      apis.push(api); calls++;
      if (calls === 2) { entered(); await held; await api.sendMessage('late'); }
      tool(api, `owned_${calls}`);
    }] });
    await loader.reload(); const lease = loader.captureReload(); lease.retireForReload(bound.bridge);
    const pending = lease.reload({ signal: control.signal }).catch(error => error);
    try {
      await started; control.abort();
      expect(await pending).toBeInstanceOf(Error);
      expect(loader.getExtensions()).toEqual({ extensions: [], errors: [] });
      complete(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(() => apis[1]!.sendMessage('late again')).toThrow('retired');
      expect(bound.messages).toEqual([]);
      await expect(lease.reload()).rejects.toThrow('consumed');
    } finally { complete(); await pending; }
  });

  it('keeps an external successor while superseded loading and late cancellation finish', async () => {
    const bound = host('bound'); const external = host('external'); const control = new AbortController();
    const apis: ExtensionAPI[] = []; let calls = 0; let complete!: () => void; let entered!: () => void;
    const held = new Promise<void>(resolve => { complete = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const loader = makeLoader({ host: bound.bridge, extensionFactories: [async api => {
      apis.push(api); const call = ++calls;
      if (call === 2) { entered(); await held; }
      tool(api, `owned_${call}`);
    }] });
    await loader.reload(); const lease = loader.captureReload(); const oldRelease = loader.captureRetirement();
    lease.retireForReload(bound.bridge);
    const pending = lease.reload({ signal: control.signal }).catch(error => error);
    try {
      await started; await loader.reload(external.bridge); control.abort();
      expect(await pending).toBeInstanceOf(Error); oldRelease();
      complete(); await new Promise<void>(resolve => setImmediate(resolve));
      expect(loader.getExtensions().extensions.flatMap(entry => entry.extension.tools).map(value => value.name)).toEqual(['owned_3']);
      await apis[2]!.sendMessage('external'); expect(external.messages).toEqual(['external']);
      loader.captureRetirement()();
    } finally { complete(); await pending; }
  });

  it('refuses stale receipt adoption and retires only its own generation after an external reload', async () => {
    const bound = host('bound'); const external = host('external'); let calls = 0; const apis: ExtensionAPI[] = [];
    const loader = makeLoader({ host: bound.bridge, extensionFactories: [api => { apis.push(api); tool(api, `owned_${++calls}`); }] });
    await loader.reload(); const lease = loader.captureReload(); lease.retireForReload(bound.bridge);
    const receipt = await lease.reload();
    expect(names(receipt)).toEqual(['owned_2']);
    await loader.reload(external.bridge);
    expect(() => receipt.assertCurrent()).toThrow('generation changed');
    expect(() => receipt.bind(bound.bridge)).toThrow('generation changed');
    expect(() => receipt.captureReload()).toThrow();
    receipt.retire();
    expect(names(receipt)).toEqual(['owned_2']);
    await apis[2]!.sendMessage('external'); expect(external.messages).toEqual(['external']);
    loader.captureRetirement()();
  });

  it('publishes ordinary candidates before abort callbacks and preserves a synchronous external reload', async () => {
    const bound = host('bound'); const attempted = host('attempted'); const external = host('external');
    let calls = 0; const apis: ExtensionAPI[] = []; let externalReload: Promise<void> | undefined;
    const loader = makeLoader({ host: bound.bridge, extensionFactories: [api => { apis.push(api); tool(api, `owned_${++calls}`); }] });
    await loader.reload();
    loader.getExtensions().extensions[0]!.extension.signal!.addEventListener('abort', () => {
      externalReload = loader.reload(external.bridge);
    }, { once: true });
    await expect(loader.reload(attempted.bridge)).rejects.toThrow('generation changed');
    await externalReload;
    expect(calls).toBe(2);
    expect(loader.getExtensions().extensions.flatMap(entry => entry.extension.tools).map(value => value.name)).toEqual(['owned_2']);
    await apis[1]!.sendMessage('external'); expect(external.messages).toEqual(['external']);
    expect(attempted.messages).toEqual([]); loader.captureRetirement()();
  });

  it('rechecks original SDK admission and candidate ownership before publishing the loaded snapshot', async () => {
    const bound = host('bound'); const external = host('external'); let calls = 0;
    const loader = makeLoader({ host: bound.bridge, extensionFactories: [api => { tool(api, `owned_${++calls}`); }] });
    await loader.reload(); const lease = loader.captureReload(); lease.retireForReload(bound.bridge);
    let admissions = 0; let externalReload: Promise<void> | undefined;
    await expect(lease.reload({ admission: () => {
      if (++admissions === 2) externalReload = loader.reload(external.bridge);
    } })).rejects.toThrow('generation changed');
    await externalReload;
    expect(loader.getExtensions().extensions.flatMap(entry => entry.extension.tools).map(value => value.name)).toEqual(['owned_3']);
    loader.captureRetirement()();
  });

  it('returns partial extension diagnostics and refuses a failed whole-snapshot projection', async () => {
    const bound = host('bound'); let failProjection = false; const apis: ExtensionAPI[] = [];
    const loader = makeLoader({ host: bound.bridge,
      extensionFactories: [api => { apis.push(api); tool(api, 'ready'); }, () => { throw new Error('Synthetic extension unavailable'); }],
      systemPromptOverride: () => { if (failProjection) throw new Error('Synthetic projection failed'); return undefined; } });
    await loader.reload(); const lease = loader.captureReload(); lease.retireForReload(bound.bridge);
    const receipt = await lease.reload();
    expect(names(receipt)).toEqual(['ready']);
    expect(receipt.snapshot.extensions.errors).toEqual([{ path: '<inline:2>', error: 'Synthetic extension unavailable' }]);
    receipt.bind(bound.bridge); const next = receipt.captureReload(); next.retireForReload(bound.bridge);
    failProjection = true;
    await expect(next.reload()).rejects.toThrow('Synthetic projection failed');
    expect(loader.getExtensions()).toEqual({ extensions: [], errors: [] });
    expect(() => apis[2]!.sendMessage('late')).toThrow('retired');
    await expect(next.reload()).rejects.toThrow('consumed');
  });
});
