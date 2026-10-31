import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile,
  type RuntimeConfig, type ProviderConnectionConfig } from '../../../config/runtimeConfig.js';
import { effectiveServiceTier, runSlowCommand } from './serviceTier.js';
import { runFastCommand } from '../fastCommandRuntime.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import { selectPooledConnection } from '../../auth/account/pool.js';

let root: string;
const connection = (id: string, tier: string): ProviderConnectionConfig => ({ id, provider: 'openai',
  authType: 'api-key', apiKey: `synthetic-${id}`, baseUrl: `https://${id}.invalid/v1`,
  model: 'model', serviceTier: tier, status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' });
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/tier-selection-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it.each(['fallback', 'pool'] as const)('reports the %s request tier instead of the independent provider default', async mode => {
  writeUserRuntimeConfigFile({ provider: 'openai', providerConnections: [connection('selected', 'flex')],
    providerCredentials: { openai: { apiKey: 'synthetic-profile', model: 'model', serviceTier: 'priority' } },
    ...(mode === 'pool' ? { accountPool: { openai: { connections: ['selected'] } } } : {}) },
    readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  const config = getRuntimeConfig(root);
  const documents = [getUserRuntimeConfigPath(), getUserAuthPath()];
  const bytes = documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  const context = { cwd: root, sessionId: 'tier-inspection', runtimeConfig: config };
  expect(resolveProviderCredential({ runtimeConfig: config, env: {}, pool: { sessionId: context.sessionId } }).credential?.connectionId).toBe('selected');
  expect(effectiveServiceTier(context)).toBe('flex');
  expect((await runSlowCommand(['status'], context)).output).toBe('Slow mode: on (flex).');
  expect((await runFastCommand(['status'], context)).output).toContain('effective service tier: flex');
  expect(documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
});

it.each(['env', 'cli'] as const)('reports the actual %s provider-slot tier despite a raw active connection', async source => {
  const config = { ...getRuntimeConfig(root), provider: 'openai' as const, activeProviderConnectionId: 'selected',
    providerConnections: [connection('selected', 'flex')],
    providerCredentials: { openai: { apiKey: 'synthetic-profile', serviceTier: 'priority' } } };
  const resolve = (candidate: RuntimeConfig) => resolveProviderCredential({ runtimeConfig: candidate,
    env: source === 'env' ? { OPENAI_API_KEY: 'synthetic-env' } : {},
    ...(source === 'cli' ? { cliApiKey: 'synthetic-cli' } : {}) });
  const context = { cwd: root, runtimeConfig: config, resolveConfigTarget: resolve };
  expect(resolve(config).credential?.connectionId).toBeUndefined();
  expect(effectiveServiceTier(context)).toBe('priority');
  expect((await runFastCommand(['status'], context)).output).toContain('Fast mode: on; effective service tier: priority');
  expect((await runSlowCommand(['status'], context)).output).toContain('off (priority)');
});

it('keeps the same pool affinity while reporting the selected member tier', async () => {
  const config = { ...getRuntimeConfig(root), provider: 'openai' as const, activeProviderConnectionId: undefined,
    providerConnections: [connection('a', 'priority'), connection('b', 'flex')], providerCredentials: {},
    accountPool: { openai: { connections: ['a', 'b'] } } };
  const sessionId = 'tier-pool-affinity';
  selectPooledConnection({ config, provider: 'openai', connectionId: 'b', sessionId });
  const resolve = (candidate: RuntimeConfig, id?: string) => resolveProviderCredential({ runtimeConfig: candidate, env: {}, pool: { sessionId: id } });
  const before = resolve(config, sessionId);
  const context = { cwd: root, sessionId, runtimeConfig: config, resolveConfigTarget: resolve };
  expect(effectiveServiceTier(context)).toBe('flex');
  await runSlowCommand(['status'], context); await runFastCommand(['status'], context);
  expect(resolve(config, sessionId).credential).toEqual(before.credential);
});

it.each(['pending', 'deleted', 'pool-empty', 'missing'] as const)('does not advertise an enabled mode for a %s request', async state => {
  const config = { ...getRuntimeConfig(root), provider: 'openai' as const, activeProviderConnectionId: 'selected',
    providerConnections: state === 'deleted' || state === 'missing' ? [] : [connection('selected', 'flex')],
    providerCredentials: { openai: state === 'missing' ? { serviceTier: 'priority' } : { apiKey: 'synthetic-profile', serviceTier: 'priority' } },
    ...(state === 'pending' ? { providerConnections: [{ ...connection('selected', 'flex'), status: 'pending' as const }] } : {}),
    ...(state === 'deleted' ? { sessionConnection: { id: 'selected', provider: 'openai' as const } } : {}),
    ...(state === 'pool-empty' ? { accountPool: { openai: { connections: [] } } } : {}),
  };
  const context = { cwd: root, runtimeConfig: config };
  expect(effectiveServiceTier(context)).toBeUndefined();
  expect((await runSlowCommand(['status'], context)).output).toContain('unverified');
  expect((await runFastCommand(['status'], context)).output).toContain('Fast mode: off; effective service tier: provider/project default (unverified)');
});
