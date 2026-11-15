import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createAgentSession, DefaultResourceLoader, type AgentSession, type ModelRoute, type ModelRouteRequest } from '../index.js';
import { catalogContributions } from '../core/catalog/contributions.js';

let directory: string;
const sessions: AgentSession[] = [];
const previous = new Map<string, string | undefined>();
beforeEach(() => {
  const parent = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(parent, { recursive: true });
  directory = fs.mkdtempSync(path.join(parent, 'virtual-registration-'));
  const home = path.join(directory, 'home'); fs.mkdirSync(home);
  for (const [key, value] of Object.entries({ HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home,
    GIT_CEILING_DIRECTORIES: directory, CHEERS_PROVIDER_MODE: 'synthetic',
    CHEERS_MARKETPLACES_FILE: path.join(home, 'sources.json'), CHEERS_EXTENSIONS_FILE: path.join(home, 'extensions.json') })) {
    previous.set(key, process.env[key]); process.env[key] = value;
  }
});
afterEach(async () => {
  for (const session of sessions.splice(0)) await session.dispose();
  for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  previous.clear(); fs.rmSync(directory, { recursive: true, force: true });
});

it.each(['inline', 'file'] as const)('publishes %s virtual registration only after initialization and retires it with its session', async kind => {
  const file = path.join(directory, 'extension.ts');
  fs.writeFileSync(file, `export default async api => {
    await Promise.resolve();
    api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic', route: () => ({ provider: 'openai', modelId: 'physical' }) });
  };`);
  const loader = new DefaultResourceLoader({ cwd: directory, noSkills: true, noThemes: true,
    ...(kind === 'file' ? { additionalExtensionPaths: [file] } : { extensionFactories: [async api => {
      await Promise.resolve(); api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic',
        route: () => ({ provider: 'openai', modelId: 'physical' }) });
    }] }) });
  await loader.reload(); expect(loader.getExtensions().errors).toEqual([]);
  const { session } = await createAgentSession({ cwd: directory, resourceLoader: loader, noTools: 'all' }); sessions.push(session);
  const definitions = catalogContributions(directory, session.sessionId).flatMap(entry => entry.virtualModels ?? []);
  expect(definitions).toHaveLength(1); expect(definitions[0]!.provider).toBe('adaptive');
  expect(session.getModelCatalog().virtual).toEqual([{ provider: 'adaptive', id: 'auto', name: 'Automatic' }]);
  expect(session.getModelCatalog().physical.some(provider => provider.id === 'adaptive')).toBe(false);
  await session.dispose();
  expect(catalogContributions(directory, session.sessionId)).toEqual([]);
  await expect(Promise.resolve().then(() => definitions[0]!.route({ provider: 'adaptive', modelId: 'auto', thinkingLevel: 'medium', reason: 'direct', messages: [] })))
    .rejects.toThrow(/retired/);
  expect(() => session.getModelCatalog()).toThrow(/disposed/);
});

it('removes old registration and pending results on reload while preserving the next generation after old disposal', async () => {
  let release!: (value: ModelRoute) => void;
  const held = new Promise<ModelRoute>(resolve => { release = resolve; });
  const loader = new DefaultResourceLoader({ cwd: directory, noSkills: true, noThemes: true, extensionFactories: [api =>
    api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: 'Automatic', route: () => held })] });
  await loader.reload(); expect(loader.getExtensions().errors).toEqual([]);
  const first = (await createAgentSession({ cwd: directory, resourceLoader: loader, noTools: 'all' })).session; sessions.push(first);
  const captured = catalogContributions(directory, first.sessionId)[0]!.virtualModels![0]!;
  const request: ModelRouteRequest = { provider: 'adaptive', modelId: 'auto', thinkingLevel: 'medium', reason: 'user', messages: [] };
  const pending = captured.route(request);
  const rejected = expect(pending).rejects.toThrow(/retired/);
  await loader.reload({});
  expect(catalogContributions(directory, first.sessionId)).toEqual([]);
  const successor = loader.getExtensions().extensions[0]!.extension.virtualModels![0]!;
  release({ provider: 'openai', modelId: 'physical' });
  await rejected;
  await first.dispose();
  await expect(successor.route(request)).resolves.toMatchObject({ modelId: 'physical' });
  loader.captureRetirement()();
});

it('keeps the same logical identity isolated between separately owned sessions', async () => {
  for (const modelId of ['first', 'second']) {
    const loader = new DefaultResourceLoader({ cwd: directory, noSkills: true, noThemes: true, extensionFactories: [api => {
      api.registerVirtualModel({ provider: 'adaptive', id: 'auto', name: modelId, route: () => ({ provider: 'openai', modelId }) });
    }] });
    await loader.reload();
    const { session } = await createAgentSession({ cwd: directory, resourceLoader: loader, noTools: 'all' }); sessions.push(session);
  }
  expect(sessions[0]!.getModelCatalog().virtual[0]!.name).toBe('first');
  expect(sessions[1]!.getModelCatalog().virtual[0]!.name).toBe('second');
  await sessions[0]!.dispose();
  expect(sessions[1]!.getModelCatalog().virtual[0]!.name).toBe('second');
});
