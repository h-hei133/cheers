import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { createConfigInputs } from '../../../config/inputs/selection.js';
import { projectTrust } from '../../security/trust/store.js';
import { runModelCommand } from '../modelCommandRuntime.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';

/**
 * The provider-level default is a separate slot from a connection's own
 * default. A connection wins at request time, but it does not own the provider
 * slot, so saving one must not be refused merely because a connection exists —
 * otherwise the same command changes outcome when credentials move between
 * files. A connection that never auto-selects leaves the provider slot in use,
 * which is the state this exercises.
 */
let home: string;
let workspace: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'model-provider-default-'));
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'model-provider-root-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
  projectTrust.setProjectTrust(workspace, 'session-only');
  writeUserRuntimeConfigFile({ provider: 'openai', activeProviderConnectionId: undefined,
    providerConnections: [{ id: 'named', provider: 'openai', authType: 'api-key', autoSelect: false, apiKey: 'synthetic-named',
      model: 'connection-model', thinkingEffort: 'low', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    providerCredentials: { openai: { apiKey: 'synthetic-provider', model: 'provider-base' } } },
  readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(workspace, { recursive: true, force: true }); });

function documents() {
  return [getUserRuntimeConfigPath(), getUserAuthPath()].map(file => JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>);
}

it('saves a provider-level default while a connection exists, without touching that connection', async () => {
  const before = documents();
  expect(resolveProviderCredential({ runtimeConfig: getRuntimeConfig(workspace), env: {} }))
    .toMatchObject({ model: 'provider-base', credential: { source: 'config' } });
  const result = await runModelCommand(['use', 'provider-model', '--global'], { cwd: workspace, projectRoot: workspace });
  expect(result.output).toContain('Model switched to provider-model');
  expect(result.output).not.toContain('Global model save refused');
  const [settings] = documents();
  expect((settings.modelPreferences as { providers?: Record<string, unknown> }).providers?.openai)
    .toMatchObject({ model: 'provider-model' });
  // The connection keeps its own default: the two layers stay independent.
  const connections = (settings.modelPreferences as { connections?: Array<{ id: string; model?: string }> }).connections ?? [];
  expect(connections.find(item => item.id === 'named')?.model).toBe('connection-model');
  // The credential document holds no model leaf at all: preferences live in settings.
  const authAfter = (documents()[1] as { providerConnections: Array<{ model?: string }> }).providerConnections[0];
  expect(authAfter?.model).toBeUndefined();
  expect((before[1] as { providerConnections: Array<{ model?: string }> }).providerConnections[0]?.model).toBeUndefined();
  // Resolution keeps the connection first, so the saved provider default is a
  // fallback and does not move the active request.
  expect(resolveProviderCredential({ runtimeConfig: getRuntimeConfig(workspace), env: {} }).model).toBe('provider-model');
});

it('still refuses when a read-only config input supplies the provider default', async () => {
  const input = path.join(workspace, 'input.json');
  fs.writeFileSync(input, JSON.stringify({ providerCredentials: { openai: { apiKey: 'synthetic-input', model: 'input-model' } } }));
  const runtimeConfig = getRuntimeConfig(workspace, undefined, createConfigInputs([{ path: input, source: 'user' }], workspace));
  const before = documents();
  const result = await runModelCommand(['use', 'provider-model', '--global'], { cwd: workspace, projectRoot: workspace, runtimeConfig });
  expect(result.output).toContain('read-only config input');
  expect(documents()).toEqual(before);
});

it('leaves a declared account pool serving the request, so its member keeps the default', async () => {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  writeUserRuntimeConfigFile({ ...edit.values, accountPool: { openai: { connections: ['named'] } } }, edit);
  const result = await runModelCommand(['use', 'provider-model', '--global'], { cwd: workspace, projectRoot: workspace });
  // A declared pool is the complete authorization: the request is served by its
  // member, so the write lands on that connection and never on the provider
  // slot the pool supersedes.
  const [settings] = documents();
  const preferences = settings.modelPreferences as { providers?: Record<string, { model?: string }>; connections?: Array<{ id: string; model?: string }> };
  // The provider slot the pool supersedes keeps its previous value untouched.
  expect(preferences.providers?.openai?.model).toBe('provider-base');
  expect(preferences.connections?.find(item => item.id === 'named')?.model).toBe('provider-model');
  expect(result.output).toContain('Model switched to provider-model');
});
