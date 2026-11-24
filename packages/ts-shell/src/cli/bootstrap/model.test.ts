import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { serializeConfigDocument } from '../../config/document.js';
import { userCatalogPath } from '../../core/models/catalogStore.js';
import { readSessionModel } from '../../session/model/state.js';
import { applyStartupModel } from './model.js';
import { createCliBootstrapRuntimeContext, createCliRootContext } from './cliBootstrapContext.js';

const processPorts = { writeError: vi.fn(), exit: (): never => { throw new Error('root context unexpectedly exited'); } };
let scratch = '';
let home = '';
let workspace = '';

beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  scratch = fs.mkdtempSync('/tmp/cheers-test/model-startup-');
  home = path.join(scratch, 'home');
  workspace = path.join(scratch, 'workspace');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', scratch);
  vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(scratch, { recursive: true, force: true });
});

function configureTarget(options: { readonly model: string; readonly provider?: 'openai' | 'openai-compatible' }) {
  const endpoint = 'https://selected.invalid/v1';
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({
    ...edit.values,
    provider: 'openai-compatible',
    activeProviderConnectionId: 'other',
    providerConnections: [
      { id: 'other', provider: 'openai-compatible', authType: 'api-key', apiKey: 'SYNTHETIC_OTHER',
        baseUrl: 'https://other.invalid/v1', model: 'other-model', status: 'connected',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'selected', provider: 'openai-compatible', authType: 'api-key', apiKey: 'SYNTHETIC_SELECTED',
        baseUrl: endpoint, model: 'default-model', status: 'connected',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ],
  }, edit);
  fs.mkdirSync(path.dirname(userCatalogPath()), { recursive: true });
  fs.writeFileSync(userCatalogPath(), serializeConfigDocument({ providers: {
    'selected-relay': { label: 'Selected relay', runtime: 'openai-compatible', auth: 'api-key', baseUrl: endpoint,
      models: [{ id: 'vendor/model' }] },
  } }, 'yaml'));

  const cliOptions = { model: options.model, ...(options.provider ? { provider: options.provider } : {}) };
  const rootContext = createCliRootContext({ launchCwd: workspace, options: cliOptions, ...processPorts });
  const bootstrap = createCliBootstrapRuntimeContext({ launchCwd: workspace, options: cliOptions, rootContext,
    writeError: vi.fn(), exit: () => { throw new Error('bootstrap unexpectedly exited'); } });
  return { cliOptions, runtimeContext: bootstrap.runtimeContext };
}

it('applies a catalog-qualified launch model to its connection before the first request', async () => {
  const { cliOptions, runtimeContext } = configureTarget({ model: 'selected-relay/vendor/model' });

  await applyStartupModel(runtimeContext, cliOptions);

  expect(readSessionModel(runtimeContext.session.id)).toMatchObject({
    connectionId: 'selected', connectionScope: 'session', provider: 'openai-compatible', model: 'vendor/model',
  });
  expect(runtimeContext.resolveConfigTarget?.(runtimeContext.runtimeConfig, runtimeContext.session.id)).toMatchObject({
    provider: 'openai-compatible', model: 'vendor/model', baseUrl: 'https://selected.invalid/v1',
    credential: { connectionId: 'selected', source: 'connection' },
  });
});

it('saves a runtime-provider-qualified launch model with its model path intact', async () => {
  const { cliOptions, runtimeContext } = configureTarget({ model: 'openai-compatible/vendor/model' });

  await applyStartupModel(runtimeContext, cliOptions);

  expect(readSessionModel(runtimeContext.session.id)).toMatchObject({
    connectionId: 'other', provider: 'openai-compatible', model: 'vendor/model',
  });
  expect(runtimeContext.resolveConfigTarget?.(runtimeContext.runtimeConfig, runtimeContext.session.id)).toMatchObject({
    provider: 'openai-compatible', model: 'vendor/model', baseUrl: 'https://other.invalid/v1',
    credential: { connectionId: 'other', source: 'connection' },
  });
});

it('keeps the explicit provider flag authoritative over a catalog-qualified model id', async () => {
  const { cliOptions, runtimeContext } = configureTarget({ model: 'selected-relay/vendor/model', provider: 'openai' });

  await applyStartupModel(runtimeContext, cliOptions);

  expect(readSessionModel(runtimeContext.session.id)).toBeUndefined();
  expect(cliOptions).toMatchObject({ provider: 'openai', model: 'selected-relay/vendor/model' });
});
