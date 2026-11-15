import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeInProcessScript, loadInProcessExtensionAsync, runExtensionFactory, type ExtensionAPI,
  type ExtensionHostBridge, type LoadedInProcessExtension } from './inProcessLoader.js';
import { runExtensionInvocation } from './context.js';
import type { ExtensionUiHost } from './ui.js';
import type { ModelRoute, ModelRouteRequest } from '../../core/models/virtual/contract.js';
import type { VersionRecord } from '../model.js';

const roots: string[] = [];
const controllers: AbortController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.abort();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function extension(source: string) {
  const parent = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'extension-virtual-')); roots.push(root);
  const filePath = path.join(root, 'extension.ts'); fs.writeFileSync(filePath, source);
  return { workspaceRoot: root, filePath };
}
function controller() { const value = new AbortController(); controllers.push(value); return value; }
function request(signal?: AbortSignal): ModelRouteRequest {
  return { provider: 'adaptive', modelId: 'auto', thinkingLevel: 'high', reason: 'user', messages: [], signal };
}

describe('session extension virtual registration', () => {
  it('waits for the complete async file registration and captures VM thinking-level arrays and generic state', async () => {
    const file = extension(`
      export default async api => {
        api.registerVirtualModel<{ count: number }>({ provider: 'adaptive', id: 'first', name: 'First',
          thinkingLevels: ['low', 'high'], route: request => ({ provider: 'openai', modelId: 'physical',
            thinkingLevel: request.thinkingLevel, state: { count: (request.state?.count ?? 0) + 1 } }) });
        await api.ui.confirm('Initialize', 'Finish registrations?');
        api.registerVirtualModel({ provider: 'adaptive', id: 'second', name: 'Second',
          route: () => ({ provider: 'openai', modelId: 'second-physical' }) });
      };
    `);
    let release!: (value: boolean) => void; let published: LoadedInProcessExtension | undefined;
    const pending = loadInProcessExtensionAsync({ ...file, signal: controller().signal, host: { ui: {
      confirm: () => new Promise(resolve => { release = resolve; }),
    } } }).then(value => { published = value; return value; });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(published).toBeUndefined(); release(true);
    const loaded = await pending; const models = loaded.virtualModels!;
    expect(models.map(model => model.id)).toEqual(['first', 'second']);
    expect(models[0]!.thinkingLevels).toEqual(['low', 'high']);
    expect(Object.isFrozen(models)).toBe(true); expect(Object.isFrozen(models[0]!.thinkingLevels)).toBe(true);
    await expect(models[0]!.route({ ...request(), modelId: 'first', state: { count: 7 } }))
      .resolves.toEqual({ provider: 'openai', modelId: 'physical', thinkingLevel: 'high', state: { count: 8 } });
  });

  it('does not publish a staged virtual definition when later async file initialization fails', async () => {
    const file = extension(`export default async api => {
      api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic', route: () => ({ provider: 'openai', modelId: 'physical' }) });
      await api.ui.confirm('Initialize', 'Reject after this answer?');
      throw new Error('virtual initialization failed');
    };`);
    let release!: (value: boolean) => void; const published = vi.fn();
    const pending = loadInProcessExtensionAsync({ ...file, host: { ui: {
      confirm: () => new Promise(resolve => { release = resolve; }),
    } } }).then(value => { published(value); return value; });
    const rejected = expect(pending).rejects.toThrow('virtual initialization failed');
    await vi.waitFor(() => expect(release).toBeTypeOf('function')); release(true);
    await rejected; expect(published).not.toHaveBeenCalled();
  });

  it('closes virtual registration after initialization without changing the accepted snapshot', async () => {
    const file = extension(`export default async api => {
      await Promise.resolve();
      api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic', route: () => ({ provider: 'openai', modelId: 'physical' }) });
      module.exports.registerLate = () => api.registerVirtualModel({ provider: 'adaptive', id: 'late', name: 'Late', route: () => ({ provider: 'openai', modelId: 'physical' }) });
    };`);
    const loaded = await loadInProcessExtensionAsync({ ...file, signal: controller().signal });
    expect(() => (loaded.exports.registerLate as () => void)()).toThrow(/registration is closed/);
    expect(loaded.virtualModels!.map(model => model.id)).toEqual(['auto']);
  });

  it('keeps the generic state registration API typed for inline extension consumers', async () => {
    const generation = controller();
    const loaded = await runExtensionFactory({ workspaceRoot: process.cwd(), signal: generation.signal, factory: api => {
      api.registerVirtualModel<{ count: number }>({ provider: 'adaptive', id: 'auto', name: 'Automatic', thinkingLevels: ['low', 'high'],
        route: routed => ({ provider: 'openai', modelId: 'physical', state: { count: (routed.state?.count ?? 0) + 1 } }),
      });
    } });
    await expect(loaded.virtualModels![0]!.route({ ...request(), state: { count: 4 } }))
      .resolves.toMatchObject({ state: { count: 5 } });
  });

  it('cancels async file initialization without publishing its staged virtual definition', async () => {
    const file = extension(`export default async api => {
      api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic', route: () => ({ provider: 'openai', modelId: 'physical' }) });
      await api.ui.confirm('Initialize', 'Remain pending?');
      api.registerVirtualModel({ provider: 'adaptive', id: 'late', name: 'Late', route: () => ({ provider: 'openai', modelId: 'physical' }) });
    };`);
    const generation = controller(); const published = vi.fn(); let signal: AbortSignal | undefined;
    const pending = loadInProcessExtensionAsync({ ...file, signal: generation.signal, host: { ui: {
      confirm: (_title, _message, options) => { signal = options?.signal; return new Promise(() => {}); },
    } } }).then(value => { published(value); return value; });
    const rejected = expect(pending).rejects.toThrow(/cancelled|retired/);
    await vi.waitFor(() => expect(signal).toBeDefined()); generation.abort();
    await rejected; expect(signal!.aborted).toBe(true); expect(published).not.toHaveBeenCalled();
  });

  it.each(['request', 'generation'] as const)('discards an in-flight route after its %s signal aborts', async owner => {
    let finish!: (route: ModelRoute) => void;
    const held = new Promise<ModelRoute>(resolve => { finish = resolve; });
    const generation = controller(); const invocation = controller(); const started = vi.fn();
    const loaded = await runExtensionFactory({ workspaceRoot: process.cwd(), signal: generation.signal,
      factory: api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
        route: () => { started(); return held; } }),
    });
    const pending = loaded.virtualModels![0]!.route(request(invocation.signal));
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    (owner === 'request' ? invocation : generation).abort();
    finish({ provider: 'openai', modelId: 'late', state: { count: 1 } });
    await rejected;
    if (owner === 'request') await expect(loaded.virtualModels![0]!.route(request()))
      .resolves.toMatchObject({ modelId: 'late' });
    else {
      await expect(loaded.virtualModels![0]!.route(request())).rejects.toMatchObject({ name: 'AbortError' });
      expect(started).toHaveBeenCalledOnce();
    }
  });

  it('retains the callback UI invocation owner through await and refuses the retired invocation later', async () => {
    let currentUi: ExtensionUiHost | undefined; let api!: ExtensionAPI;
    const host: ExtensionHostBridge = { get ui() { return currentUi; } };
    const generation = controller();
    const loaded = await runExtensionFactory({ workspaceRoot: process.cwd(), host, signal: generation.signal,
      factory: value => {
        api = value;
        value.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic', route: async () => {
          const answer = await value.ui.input('Destination'); value.ui.setEditorText(answer ?? 'cancelled');
          return { provider: 'openai', modelId: answer ?? 'cancelled' };
        } });
      },
    });
    let answer!: (value: string) => void;
    const originalEdit = vi.fn(), replacementEdit = vi.fn(), outsideEdit = vi.fn();
    const originalInput = vi.fn((_title: string, _placeholder?: string, options?: { signal?: AbortSignal }) => {
      expect(options?.signal?.aborted).toBe(false); return new Promise<string>(resolve => { answer = resolve; });
    });
    currentUi = { input: originalInput, setEditorText: originalEdit };
    const pending = runExtensionInvocation({ input: async () => 'outside', setEditorText: outsideEdit }, undefined,
      () => loaded.virtualModels![0]!.route(request()));
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    currentUi = { input: async () => 'replacement', setEditorText: replacementEdit };
    answer('original');
    await expect(pending).resolves.toMatchObject({ modelId: 'original' });
    expect(originalEdit).toHaveBeenCalledWith('original');
    expect(replacementEdit).not.toHaveBeenCalled(); expect(outsideEdit).not.toHaveBeenCalled();
    generation.abort(); expect(() => api.ui.setEditorText('late')).toThrow(/retired/);
    expect(originalEdit).toHaveBeenCalledTimes(1);
  });

  it('reports virtual registration as explicitly unsupported through the actual worker execution adapter', async () => {
    const file = extension(`export default api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
      route: () => ({ provider: 'openai', modelId: 'physical' }) });`);
    const record: VersionRecord = { source: 'fixture', digest: 'a'.repeat(64), url: 'https://example.invalid/virtual.tgz',
      trustFingerprint: 'fixture', files: {}, directories: [], storage: [], sourceIdentity: 'fixture-worker',
      manifest: { schema: 1, name: 'worker-virtual', version: '1.0.0', permissions: { workspace: 'read', network: 'none' },
        skills: [], scripts: [{ name: 'main', path: 'extension.ts' }], commands: [], tools: [] },
    };
    const result = await executeInProcessScript({ root: file.workspaceRoot, scriptFile: file.filePath, record, argv: [],
      denyRules: () => [], context: { workspaceRoot: file.workspaceRoot, taskId: 'worker-virtual' },
    });
    expect(result.success).toBe(false);
    expect(result.output).toContain('Virtual model registration is unavailable in worker extensions. Use a session extension.');
    expect(result.metadata?.registeredTools).toEqual([]); expect(result.metadata?.registeredCommands).toEqual([]);
  });
});
