import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { catalogCachePath, loadCatalog, loadCatalogSnapshot, userCatalogPath, writeCatalogCache } from './catalogStore.js';

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

it.each(['{ "providers": PRIVATE_CATALOG_VALUE', 'null', '[]', '{"providers":[]}', '{"providers":null}'])(
  'degrades malformed catalogue input with a safe notice: %s', text => {
    fs.writeFileSync(userCatalogPath(), text);
    const before = fs.readFileSync(userCatalogPath());
    const snapshot = loadCatalogSnapshot();
    expect(snapshot.providers.some(provider => provider.id === 'openai')).toBe(true);
    expect(snapshot.diagnostics).toHaveLength(1);
    expect(snapshot.diagnostics[0]).toContain('models.json');
    expect(snapshot.diagnostics[0]).toContain('entries were ignored');
    expect(snapshot.diagnostics.join(' ')).not.toContain('PRIVATE_CATALOG_VALUE');
    expect(fs.readFileSync(userCatalogPath())).toEqual(before);
  },
);

it('distinguishes unreadable optional storage from absent storage', () => {
  fs.mkdirSync(userCatalogPath());
  expect(loadCatalogSnapshot().diagnostics).toEqual(['models.json could not be read; its catalogue entries were ignored.']);
});

it.each(['providers', 'provi\\u0064ers'])(
  'warns about repeated top-level %s without changing JSON last-object precedence', key => {
    const text = '{"providers":{"openai":{"models":[{"id":"first-only"}]}},"' + key
      + '":{"openai":{"models":[{"id":"last-only"}]}}}';
    fs.writeFileSync(userCatalogPath(), text);
    const snapshot = loadCatalogSnapshot();
    expect(snapshot.diagnostics.join(' ')).toContain('repeats the top-level providers key');
    const models = snapshot.providers.find(provider => provider.id === 'openai')!.models;
    expect(models.some(model => model.id === 'last-only')).toBe(true);
    expect(models.some(model => model.id === 'first-only')).toBe(false);
    expect(fs.readFileSync(userCatalogPath(), 'utf8')).toBe(text);
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
  expect(snapshot.diagnostics).toEqual(['models.json could not be parsed; its catalogue entries were ignored.']);
  fs.writeFileSync(catalogCachePath(), '{bad');
  fs.writeFileSync(userCatalogPath(), '{"providers":{"openai":{"models":[{"id":"user-only"}]}}}');
  const recovered = loadCatalogSnapshot();
  expect(recovered.providers.find(provider => provider.id === 'openai')!.models.some(model => model.id === 'user-only')).toBe(true);
  expect(recovered.diagnostics).toEqual(['models-cache.json could not be parsed; its catalogue entries were ignored.']);
});
