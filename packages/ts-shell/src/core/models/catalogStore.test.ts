import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { catalogCachePath, ensureUserCatalog, loadCatalog, loadCatalogSnapshot, userCatalogPath, writeCatalogCache } from './catalogStore.js';
import { isUserConfiguredModel } from './catalog.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/catalog-store-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  fs.mkdirSync(path.dirname(userCatalogPath()), { recursive: true });
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('keeps optional absent catalogue layers silent', () => {
  const snapshot = loadCatalogSnapshot();
  expect(snapshot.providers.length).toBeGreaterThan(0);
  expect(snapshot.diagnostics).toEqual([]);
  expect(snapshot.providers).toEqual(loadCatalog());
  expect(fs.existsSync(userCatalogPath())).toBe(false);
});

it('reads the YAML catalogue and creates an owner-only commented example atomically', () => {
  fs.writeFileSync(userCatalogPath(), '# custom providers\nproviders:\n  local:\n    runtime: openai-compatible\n    auth: api-key\n    baseUrl: https://gateway.example.invalid/v1\n    models:\n      - id: model-one\n');
  expect(loadCatalogSnapshot().providers.find(provider => provider.id === 'local')?.models[0]?.id).toBe('model-one');
  fs.unlinkSync(userCatalogPath());
  const created = ensureUserCatalog();
  expect(created.endsWith('models.yaml')).toBe(true);
  expect(fs.readFileSync(created, 'utf8')).toContain('# Add custom providers and models below.');
  if (process.platform !== 'win32') expect(fs.statSync(created).mode & 0o777).toBe(0o600);
  const before = fs.readFileSync(created);
  expect(ensureUserCatalog()).toBe(created);
  expect(fs.readFileSync(created)).toEqual(before);
});

it.each(['{ "providers": PRIVATE_CATALOG_VALUE', 'null', '[]', '{"providers":[]}', '{"providers":null}'])(
  'degrades malformed catalogue input with a safe notice: %s', text => {
    fs.writeFileSync(userCatalogPath(), text);
    const before = fs.readFileSync(userCatalogPath());
    const snapshot = loadCatalogSnapshot();
    expect(snapshot.providers.some(provider => provider.id === 'openai')).toBe(true);
    expect(snapshot.diagnostics).toHaveLength(1);
    expect(snapshot.diagnostics[0]).toContain(path.basename(userCatalogPath()));
    expect(snapshot.diagnostics[0]).toContain('entries were ignored');
    expect(snapshot.diagnostics.join(' ')).not.toContain('PRIVATE_CATALOG_VALUE');
    expect(fs.readFileSync(userCatalogPath())).toEqual(before);
  },
);

it('distinguishes unreadable optional storage from absent storage', () => {
  fs.mkdirSync(userCatalogPath());
    expect(loadCatalogSnapshot().diagnostics).toEqual([`${path.basename(userCatalogPath())} could not be read; its catalogue entries were ignored.`]);
});

it.each(['providers', 'provi\\u0064ers'])(
  'warns about repeated top-level %s without changing JSON last-object precedence', key => {
    const text = '{"providers":{"openai":{"models":[{"id":"first-only"}]}},"' + key
      + '":{"openai":{"models":[{"id":"last-only"}]}}}';
    const legacyJson = path.join(path.dirname(userCatalogPath()), 'models.json');
    fs.writeFileSync(legacyJson, text);
    const snapshot = loadCatalogSnapshot();
    expect(snapshot.diagnostics.join(' ')).toContain('repeats the top-level providers key');
    const models = snapshot.providers.find(provider => provider.id === 'openai')!.models;
    expect(models.some(model => model.id === 'last-only')).toBe(true);
    expect(models.some(model => model.id === 'first-only')).toBe(false);
    expect(fs.readFileSync(legacyJson, 'utf8')).toBe(text);
  },
);

it('ignores nested owner keys and key-like text while keeping refreshed entries on a bad user layer', () => {
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ label: '"providers": {}', providers: {
    openai: { label: '"providers": {}', nested: { providers: {}, child: { providers: {} } } },
  } }));
  expect(loadCatalogSnapshot().diagnostics).toEqual([]);
  writeCatalogCache([{ id: 'openai', models: [{ id: 'refreshed-only' }] }]);
  fs.writeFileSync(userCatalogPath(), '{bad');
  const snapshot = loadCatalogSnapshot();
  expect(snapshot.providers.find(provider => provider.id === 'openai')!.models.some(model => model.id === 'refreshed-only')).toBe(true);
  expect(snapshot.diagnostics).toEqual(['models.yaml could not be parsed; its catalogue entries were ignored.']);
  fs.writeFileSync(catalogCachePath(), '{bad');
  fs.writeFileSync(userCatalogPath(), '{"providers":{"openai":{"models":[{"id":"user-only"}]}}}');
  const recovered = loadCatalogSnapshot();
  expect(recovered.providers.find(provider => provider.id === 'openai')!.models.some(model => model.id === 'user-only')).toBe(true);
  expect(recovered.diagnostics).toEqual(['models-cache.json could not be parsed; its catalogue entries were ignored.']);
});

it('tracks only model IDs authored in the user catalogue after refreshed and built-in merges', () => {
  writeCatalogCache([{ id: 'openai', models: [{ id: 'refreshed-only' }] }]);
  fs.writeFileSync(userCatalogPath(), JSON.stringify({ providers: {
    openai: { label: 'Configured gateway', configuredModels: ['o4-mini'], models: [{ id: 'gpt-5.3' }, { id: 'user-model' }] },
    mine: { runtime: 'openai-compatible', auth: 'api-key', models: [{ id: 'mine-model' }] },
  } }));

  const snapshot = loadCatalogSnapshot();
  const openai = snapshot.providers.find(provider => provider.id === 'openai')!;
  const mine = snapshot.providers.find(provider => provider.id === 'mine')!;
  expect(isUserConfiguredModel(openai, 'gpt-5.3')).toBe(true);
  expect(isUserConfiguredModel(openai, 'user-model')).toBe(true);
  expect(isUserConfiguredModel(openai, 'o4-mini')).toBe(false);
  expect(isUserConfiguredModel(openai, 'refreshed-only')).toBe(false);
  expect(isUserConfiguredModel(mine, 'mine-model')).toBe(true);
});
