import { afterEach, expect, it, vi } from 'vitest';
import { catalogContributions, registerCatalogContribution, type CatalogContribution } from './contributions.js';
import { VirtualModelRegistry, type VirtualModelDefinition } from '../models/virtualModels.js';
import type { CatalogProvider } from '../models/catalog.js';
import { sessionModelCatalog } from './models.js';

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
const definition = (route = () => ({ provider: 'openai', modelId: 'physical' })): VirtualModelDefinition =>
  ({ provider: 'adaptive', id: 'auto', name: 'Automatic', route });
function contribution(sessionId: string, virtualModels = [definition()], signal?: AbortSignal): CatalogContribution {
  return { root: '/catalog-fixture', sessionId, commands: [], tools: [], skills: () => [], virtualModels, signal };
}

it('isolates virtual definitions by session and rejects duplicate logical identities', () => {
  cleanups.push(registerCatalogContribution(contribution('first')));
  cleanups.push(registerCatalogContribution(contribution('second')));
  expect(catalogContributions('/catalog-fixture', 'first')).toHaveLength(1);
  expect(catalogContributions('/catalog-fixture', 'missing')).toEqual([]);
  expect(catalogContributions('/catalog-fixture')).toEqual([]);
  expect(() => registerCatalogContribution(contribution('first'))).toThrow(/collision/);
});

it('refuses a virtual definition that shadows an accepted physical catalogue entry', () => {
  const physical: readonly CatalogProvider[] = [{ id: 'adaptive', label: 'Physical', runtime: 'openai', auth: 'api-key', models: [{ id: 'auto' }] }];
  expect(() => registerCatalogContribution(contribution('physical'), physical)).toThrow(/physical/);
  expect(catalogContributions('/catalog-fixture', 'physical')).toEqual([]);
});

it('retires captured callbacks and discards a result after unregister without deleting a successor', async () => {
  let complete!: (value: { provider: string; modelId: string }) => void;
  const held = new Promise<{ provider: string; modelId: string }>(resolve => { complete = resolve; });
  const first = contribution('late', [{ ...definition(), route: () => held }]);
  const remove = registerCatalogContribution(first); cleanups.push(remove);
  const captured = catalogContributions('/catalog-fixture', 'late')[0]!.virtualModels![0]!;
  const pending = captured.route({ provider: 'adaptive', modelId: 'auto', thinkingLevel: 'medium', reason: 'user', messages: [] });
  remove(); const successor = contribution('late'); cleanups.push(registerCatalogContribution(successor)); remove();
  complete({ provider: 'openai', modelId: 'physical' });
  await expect(Promise.resolve(pending)).rejects.toThrow(/retired/);
  expect(catalogContributions('/catalog-fixture', 'late')).toHaveLength(1);
  await expect(Promise.resolve().then(() => captured.route({ provider: 'adaptive', modelId: 'auto', thinkingLevel: 'medium', reason: 'direct', messages: [] }))).rejects.toThrow(/retired/);
});

it('withdraws contributions when the resource generation retires', () => {
  const controller = new AbortController();
  cleanups.push(registerCatalogContribution(contribution('retire', [definition()], controller.signal)));
  controller.abort();
  expect(catalogContributions('/catalog-fixture', 'retire')).toEqual([]);
  expect(() => registerCatalogContribution(contribution('aborted', [definition()], controller.signal))).toThrow();
});

it('does not invoke a caller signal accessor during collision admission', () => {
  const controller = new AbortController();
  const read = vi.fn(() => {
    cleanups.push(registerCatalogContribution(contribution('signal-accessor')));
    return false;
  });
  Object.defineProperty(controller.signal, 'aborted', { get: read });
  cleanups.push(registerCatalogContribution(contribution('signal-accessor', [definition()], controller.signal)));
  expect(read).not.toHaveBeenCalled();
  expect(catalogContributions('/catalog-fixture', 'signal-accessor')).toHaveLength(1);
  controller.abort();
  expect(catalogContributions('/catalog-fixture', 'signal-accessor')).toEqual([]);
});

it('keeps registration and retirement independent of replaced signal observer methods', () => {
  const controller = new AbortController();
  const add = vi.fn(() => { throw new Error('replaced add observer'); });
  const remove = vi.fn(() => { throw new Error('replaced remove observer'); });
  controller.signal.addEventListener = add;
  controller.signal.removeEventListener = remove;
  cleanups.push(registerCatalogContribution(contribution('observer-methods', [definition()], controller.signal)));
  expect(catalogContributions('/catalog-fixture', 'observer-methods')).toHaveLength(1);
  controller.abort();
  expect(catalogContributions('/catalog-fixture', 'observer-methods')).toEqual([]);
  expect(add).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
});

it('captures virtual metadata and callback identity before caller mutation', async () => {
  const route = vi.fn(() => ({ provider: 'openai', modelId: 'physical' }));
  const model = definition(route); const entry = contribution('capture', [model]);
  cleanups.push(registerCatalogContribution(entry));
  Object.assign(model, { id: 'replacement', route: () => { throw new Error('replacement callback'); } });
  const captured = catalogContributions('/catalog-fixture', 'capture')[0]!.virtualModels![0]!;
  expect(captured.id).toBe('auto');
  await expect(Promise.resolve(captured.route({ provider: 'adaptive', modelId: 'auto', thinkingLevel: 'medium', reason: 'direct', messages: [] })))
    .resolves.toMatchObject({ modelId: 'physical' });
  expect(route).toHaveBeenCalledOnce();
});

it('registry cleanup only retires the generation that owns it', async () => {
  const registry = new VirtualModelRegistry(); const remove = registry.register(definition());
  expect(typeof remove).toBe('function'); remove();
  const successor = registry.register(definition()); remove();
  expect(registry.get('adaptive', 'auto')).toBeDefined(); successor();
  expect(registry.list()).toEqual([]);
});

it('rejects oversized registration before reading model slots', () => {
  const models: VirtualModelDefinition[] = Array.from({ length: 257 }, () => definition());
  const read = vi.fn(() => definition());
  Object.defineProperty(models, '0', { get: read });
  expect(() => registerCatalogContribution(contribution('bounded', models))).toThrow(/limit/);
  expect(read).not.toHaveBeenCalled();
  expect(catalogContributions('/catalog-fixture', 'bounded')).toEqual([]);
});

it('does not let an array method bypass definition capture', () => {
  const models = [definition()];
  const map = vi.fn(() => models);
  Object.defineProperty(models, 'map', { value: map });
  expect(() => registerCatalogContribution(contribution('array-method', models))).toThrow();
  expect(map).not.toHaveBeenCalled();
  expect(catalogContributions('/catalog-fixture', 'array-method')).toEqual([]);
});

it('checks collisions after contribution property capture can register another owner', () => {
  const entry = contribution('reentry');
  Object.defineProperty(entry, 'skills', { enumerable: true, get: () => {
    cleanups.push(registerCatalogContribution(contribution('reentry')));
    return () => [];
  } });
  expect(() => registerCatalogContribution(entry)).toThrow(/collision/);
  expect(catalogContributions('/catalog-fixture', 'reentry')).toHaveLength(1);
});

it('retains the original request cancellation after a router replaces its signal', async () => {
  const controller = new AbortController();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const model: VirtualModelDefinition = { ...definition(), route: async request => {
    Object.assign(request, { signal: new AbortController().signal });
    await held;
    return { provider: 'openai', modelId: 'physical' };
  } };
  cleanups.push(registerCatalogContribution(contribution('request-cancel', [model])));
  const captured = catalogContributions('/catalog-fixture', 'request-cancel')[0]!.virtualModels![0]!;
  const pending = captured.route({ provider: 'adaptive', modelId: 'auto', thinkingLevel: 'medium', reason: 'user', messages: [], signal: controller.signal });
  controller.abort(); release();
  await expect(pending).rejects.toThrow();
});

it('rejects result accessors without publishing state into a later registration', async () => {
  const registry = new VirtualModelRegistry();
  const successor = vi.fn(() => ({ provider: 'openai', modelId: 'physical' }));
  let replaced = false;
  const remove = registry.register({ ...definition(), route: () => ({ provider: 'openai', modelId: 'physical', get state() {
    if (!replaced) { replaced = true; remove(); cleanups.push(registry.register(definition(successor))); }
    return 'old-state';
  } }) });
  cleanups.push(remove);
  const request = { provider: 'adaptive', modelId: 'auto', thinkingLevel: 'medium' as const, reason: 'user' as const, messages: [] };
  await expect(registry.resolve(request)).rejects.toThrow(/accessors/);
  expect(replaced).toBe(false);
  remove(); cleanups.push(registry.register(definition(successor)));
  await registry.resolve(request);
  expect(successor).toHaveBeenCalledWith(expect.objectContaining({ state: undefined }));
});

it('captures route state without retaining caller data or a then accessor', async () => {
  const registry = new VirtualModelRegistry();
  const state = { count: 1 };
  const seen: unknown[] = [];
  registry.register({ ...definition(), route: request => { seen.push(request.state); return { provider: 'openai', modelId: 'physical', state }; } });
  const request = { provider: 'adaptive', modelId: 'auto', thinkingLevel: 'medium' as const, reason: 'user' as const, messages: [] };
  const first = await registry.resolve(request);
  state.count = 8;
  await registry.resolve(request);
  expect(first?.state).toEqual({ count: 1 });
  expect(seen).toEqual([undefined, { count: 1 }]);

  let reads = 0;
  const remove = registry.register({ ...definition(), id: 'then', route: () => ({ provider: 'openai', modelId: 'physical',
    get then() { if (++reads === 2) remove(); return undefined; },
  }) });
  await expect(registry.resolve({ ...request, modelId: 'then' })).rejects.toThrow(/unsupported fields/);
  expect(reads).toBe(1);
  remove();
});

it('does not let the router change the captured publication reason or cancellation method', async () => {
  const registry = new VirtualModelRegistry();
  const controller = new AbortController();
  const request = { provider: 'adaptive', modelId: 'auto', thinkingLevel: 'medium' as const,
    reason: 'user' as 'user' | 'direct', messages: [], signal: controller.signal };
  const route = vi.fn(() => { request.reason = 'direct'; return { provider: 'openai', modelId: 'physical', state: 1 }; });
  registry.register(definition(route));
  await registry.resolve(request);
  request.reason = 'user';
  await registry.resolve(request);
  expect(route).toHaveBeenLastCalledWith(expect.objectContaining({ state: 1 }));
  route.mockImplementation(() => {
    controller.signal.throwIfAborted = () => {};
    controller.abort();
    return { provider: 'openai', modelId: 'physical', state: 2 };
  });
  await expect(registry.resolve(request)).rejects.toThrow();
});

it('presents callback-free logical metadata beside the physical catalogue', () => {
  cleanups.push(registerCatalogContribution(contribution('metadata')));
  const view = sessionModelCatalog('/catalog-fixture', 'metadata', []);
  expect(view).toEqual({ physical: [], virtual: [{ provider: 'adaptive', id: 'auto', name: 'Automatic' }] });
  expect(Object.isFrozen(view.virtual[0])).toBe(true);
  expect('route' in view.virtual[0]!).toBe(false);
});
