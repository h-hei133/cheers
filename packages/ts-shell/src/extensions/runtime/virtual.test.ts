import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeInProcessScript, loadInProcessExtensionAsync, runExtensionFactory, type ExtensionAPI,
  type ExtensionHostBridge, type LoadedInProcessExtension } from './inProcessLoader.js';
import { runExtensionInvocation } from './context.js';
import type { ExtensionUiHost, ExtensionUiApi } from './ui.js';
import type { ModelRoute, ModelRouteRequest, ModelRouteInput } from '../../core/models/virtual/contract.js';
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
function request(signal?: AbortSignal): ModelRouteInput {
  return { provider: 'adaptive', modelId: 'auto', thinkingLevel: 'high', reason: 'user', messages: [], signal };
}

describe('session extension virtual registration', () => {
  it('types host route inputs separately from callback and UI cancellation observations', async () => {
    if (false) {
      const observed = {} as ModelRouteRequest;
      const hosted = {} as ModelRouteInput;
      const callbackUi = {} as Required<ExtensionUiApi>;
      const hostUi = {} as Required<ExtensionUiHost>;
      await callbackUi.input('Destination', undefined, { signal: observed.signal });
      await hostUi.input('Destination', undefined, { signal: hosted.signal });
      // @ts-expect-error Callback observations do not promise native AbortSignal branding.
      const input: ModelRouteInput = observed;
      // @ts-expect-error Physical UI hosts only consume native AbortSignal inputs.
      await hostUi.input('Destination', undefined, { signal: observed.signal });
      void input;
    }
    expect(true).toBe(true);
  });
  it.each(['request', 'messages', 'message', 'state', 'signal'] as const)('keeps the file route %s in the VM realm', async field => {
    const file = extension(`export default api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
      route: request => {
        const values = { request, messages: request.messages, message: request.messages[0], state: request.state, signal: request.signal };
        let escaped = false;
        try { escaped = values[${JSON.stringify(field)}].constructor.constructor('return typeof process')() === 'object'; } catch {}
        return { provider: 'openai', modelId: 'physical', state: { escaped } };
      } });`);
    const loaded = await loadInProcessExtensionAsync({ ...file, signal: controller().signal });
    const result = await loaded.virtualModels![0]!.route({ ...request(controller().signal),
      messages: [{ role: 'user', content: 'Authored message' }], state: { count: 1 } });
    expect(result.state).toEqual({ escaped: false });
  });

  it.each(['promise', 'error'] as const)('does not expose a host UI %s to a file route', async target => {
    const file = extension(`export default api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
      route: async () => {
        const escapes = value => { try { return value.constructor.constructor('return typeof process')() === 'object'; } catch { return false; } };
        const pending = api.ui.input('Destination');
        let escaped = ${target === 'promise' ? 'escapes(pending)' : 'false'};
        try { await pending; } catch (error) { ${target === 'error' ? 'escaped = escapes(error);' : ''} }
        return { provider: 'openai', modelId: 'physical', state: { escaped } };
      } });`);
    const loaded = await loadInProcessExtensionAsync({ ...file, signal: controller().signal, host: { ui: {
      input: async () => { if (target === 'error') throw new Error('Host dialog failed.'); return 'destination'; },
    } } });
    expect((await loaded.virtualModels![0]!.route(request())).state).toEqual({ escaped: false });
  });

  it('keeps cancellation events and thrown cancellation errors in the file VM realm', async () => {
    const file = extension(`export default api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
      route: async request => {
        module.exports.started = true;
        await new Promise(resolve => request.signal.addEventListener('abort', event => {
          module.exports.cancelType = event.type;
          let escaped = false;
          try { request.signal.throwIfAborted(); } catch (error) {
            module.exports.cancelName = error.name;
            try { escaped = error.constructor.constructor('return typeof process')() === 'object'; } catch {}
          }
          module.exports.cancelEscaped = escaped;
          resolve();
        }, { once: true }));
        return { provider: 'openai', modelId: 'late' };
      } });`);
    const generation = controller(), invocation = controller();
    const loaded = await loadInProcessExtensionAsync({ ...file, signal: generation.signal });
    const pending = loaded.virtualModels![0]!.route(request(invocation.signal));
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(loaded.exports.started).toBe(true));
    invocation.abort(new Error('Host cancellation.'));
    await rejected;
    expect(loaded.exports.cancelType).toBe('abort');
    expect(loaded.exports.cancelName).toBe('AbortError');
    expect(loaded.exports.cancelEscaped).toBe(false);
  });

  it('copies and freezes nested file inputs and retains primitive failure and previous-target data', async () => {
    const file = extension(`export default api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
      route: request => {
        module.exports.held = request;
        return { provider: 'openai', modelId: 'physical', state: {
          frozen: [request, request.messages, request.messages[0], request.state, request.state.values, request.previous, request.failed].every(Object.isFrozen),
          previous: request.previous, failed: request.failed,
        } };
      } });`);
    const loaded = await loadInProcessExtensionAsync({ ...file, signal: controller().signal });
    const message = { role: 'user' as const, content: 'Original' }, state = { values: [1] };
    const previous = { provider: 'openai', modelId: 'first', thinkingLevel: 'low' };
    const failed = { provider: 'openai', modelId: 'second', stopReason: 'error', errorMessage: 'Bounded failure', failureClass: 'provider_network' };
    const result = await loaded.virtualModels![0]!.route({ ...request(), messages: [message], state, previous, failed } as ModelRouteInput);
    message.content = 'Changed'; state.values[0] = 9;
    expect(result.state).toEqual({ frozen: true, previous, failed });
    expect((loaded.exports.held as ModelRouteRequest).messages[0]!.content).toBe('Original');
    expect((loaded.exports.held as ModelRouteRequest).state).toEqual({ values: [1] });
  });

  it('cancels file UI with its VM signal while retaining generation reuse', async () => {
    const file = extension(`export default api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
      route: async request => {
        const answer = await api.ui.input('Destination', undefined, { signal: request.signal });
        api.ui.setEditorText(answer ?? 'cancelled');
        return { provider: 'openai', modelId: answer ?? 'cancelled' };
      } });`);
    const generation = controller(), invocation = controller();
    let uiSignal: AbortSignal | undefined;
    const edit = vi.fn();
    const loaded = await loadInProcessExtensionAsync({ ...file, signal: generation.signal, host: { ui: {
      input: (_title, placeholder, options) => {
        expect(placeholder).toBeUndefined(); uiSignal = options?.signal;
        return new Promise(() => {});
      }, setEditorText: edit,
    } } });
    const pending = loaded.virtualModels![0]!.route(request(invocation.signal));
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(uiSignal).toBeDefined()); invocation.abort(); await rejected;
    expect(uiSignal!.aborted).toBe(true);
    expect(edit).not.toHaveBeenCalled();
    expect(generation.signal.aborted).toBe(false);
  });

  it('keeps abort-listener UI effects under the retired original file invocation', async () => {
    const file = extension(`export default api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
      route: request => new Promise(resolve => {
        module.exports.started = true;
        request.signal.addEventListener('abort', () => {
          api.ui.setEditorText('cancelled');
          resolve({ provider: 'openai', modelId: 'late' });
        }, { once: true });
      }) });`);
    const generation = controller(), invocation = controller();
    const original = vi.fn(), replacement = vi.fn();
    let ui: ExtensionUiHost = { setEditorText: original };
    const loaded = await loadInProcessExtensionAsync({ ...file, signal: generation.signal, host: { get ui() { return ui; } } });
    const pending = loaded.virtualModels![0]!.route(request(invocation.signal));
    const rejected = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(loaded.exports.started).toBe(true));
    ui = { setEditorText: replacement }; invocation.abort(); await rejected;
    expect(original).not.toHaveBeenCalled(); expect(replacement).not.toHaveBeenCalled();
  });

  it('preserves file route UI ownership through await and rejects result accessors before reading them', async () => {
    const file = extension(`export default api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
      route: async () => {
        const answer = await api.ui.input('Destination');
        api.ui.setEditorText(answer);
        return { provider: 'openai', modelId: 'physical', get state() { module.exports.read = true; return {}; } };
      } });`);
    let currentUi: ExtensionUiHost | undefined;
    let answer!: (value: string) => void;
    const originalEdit = vi.fn(), replacementEdit = vi.fn();
    currentUi = { input: () => new Promise(resolve => { answer = resolve; }), setEditorText: originalEdit };
    const loaded = await loadInProcessExtensionAsync({ ...file, signal: controller().signal, host: { get ui() { return currentUi; } } });
    const pending = loaded.virtualModels![0]!.route(request());
    const rejected = expect(pending).rejects.toThrow(/accessor|inert/i);
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    currentUi = { input: async () => 'replacement', setEditorText: replacementEdit };
    answer('original');
    await rejected;
    expect(originalEdit).toHaveBeenCalledWith('original');
    expect(replacementEdit).not.toHaveBeenCalled();
    expect(loaded.exports.read).toBeUndefined();
  });

  it('settles a file UI reply even when its caller signal cleanup throws', async () => {
    const file = extension(`export default api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
      route: async () => {
        const signal = { aborted: false, reason: undefined, onabort: null, throwIfAborted() {}, addEventListener() {},
          removeEventListener() { throw new Error('VM cleanup failed.'); } };
        try {
          const answer = await api.ui.input('Destination', undefined, { signal });
          module.exports.settled = 'resolved';
          return { provider: 'openai', modelId: answer };
        } catch (error) {
          module.exports.settled = 'rejected';
          return { provider: 'openai', modelId: 'refused' };
        }
      } });`);
    const invocation = controller();
    const loaded = await loadInProcessExtensionAsync({ ...file, signal: controller().signal, host: { ui: { input: async () => 'physical' } } });
    const pending = loaded.virtualModels![0]!.route(request(invocation.signal));
    const observed = pending.then(value => ({ value }), error => ({ error }));
    try {
      await vi.waitFor(() => expect(loaded.exports.settled).toBe('resolved'), { timeout: 300 });
    } finally { invocation.abort(); await observed; }
  });

  it('drops a file UI setup that throws before host dispatch and leaves its stale cancellation inert', async () => {
    const file = extension(`export default api => api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
      route: async () => {
        let cancel;
        const signal = { aborted: false, reason: undefined, onabort: null, throwIfAborted() {},
          addEventListener(_type, callback) { cancel = callback; throw new Error('VM setup failed.'); },
          removeEventListener() { module.exports.removed = true; } };
        try { await api.ui.input('Destination', undefined, { signal }); } catch {}
        module.exports.cancel = () => { cancel(); module.exports.cancelled = true; };
        return { provider: 'openai', modelId: 'physical' };
      } });`);
    const input = vi.fn(async () => 'physical');
    const loaded = await loadInProcessExtensionAsync({ ...file, signal: controller().signal, host: { ui: { input } } });
    await loaded.virtualModels![0]!.route(request());
    expect(input).not.toHaveBeenCalled();
    expect(loaded.exports.removed).toBe(true);
    expect(() => (loaded.exports.cancel as () => void)()).not.toThrow();
    expect(loaded.exports.cancelled).toBe(true);
  });

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
