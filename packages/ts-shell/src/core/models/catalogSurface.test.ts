import fs from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserAuthPath, getUserRuntimeConfigPath, type RuntimeConfig, type ProviderConnectionConfig } from '../../config/runtimeConfig.js';
import { userCatalogPath } from './catalogStore.js';
import { runModelCommand } from '../commands/modelCommandRuntime.js';
import { selectPooledConnection } from '../auth/account/pool.js';
import { resolveProviderCredential, type ProviderCredentialResolution } from '../shell/providerCredentials.js';
import type { CatalogProvider } from './catalog.js';

let root: string;
const address = (name: string) => `https://${name}.invalid/v1`;
const catalog: readonly CatalogProvider[] = [
  { id: 'openai', label: 'Canonical', runtime: 'openai', auth: 'api-key', baseUrl: address('official'), models: [{ id: 'shared' }] },
  ...['a', 'b'].map(name => ({ id: `relay-${name}`, label: `Relay ${name}`, runtime: 'openai' as const,
    auth: 'api-key' as const, baseUrl: address(name), models: [{ id: 'shared' }] })),
];
const connection = (id: string, extra: Partial<ProviderConnectionConfig> = {}): ProviderConnectionConfig => ({
  id, provider: 'openai', authType: 'api-key', baseUrl: address(id), model: 'shared', apiKey: `synthetic-${id}`,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra,
});
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/catalog-surface-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('OPENAI_API_KEY', '');
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

async function render(overrides: Partial<RuntimeConfig> = {}, providers = catalog,
  resolveTarget?: (config: RuntimeConfig) => ProviderCredentialResolution) {
  const config = { ...getRuntimeConfig(root), provider: 'openai' as const,
    activeProviderConnectionId: 'a', providerConnections: [connection('a')], providerCredentials: {}, ...overrides };
  const before = fs.readdirSync(root);
  const documents = [getUserRuntimeConfigPath(), getUserAuthPath(), userCatalogPath()];
  const bytes = documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined);
  const result = await runModelCommand([], { cwd: root, readConfiguration: () => ({ config, catalog: providers }),
    resolveConfigTarget: resolveTarget ?? (candidate => resolveProviderCredential({ runtimeConfig: candidate, env: {} })) });
  expect(fs.readdirSync(root)).toEqual(before);
  expect(documents.map(file => fs.existsSync(file) ? fs.readFileSync(file) : undefined)).toEqual(bytes);
  expect(result.output).not.toContain('synthetic-');
  return result.output;
}

function group(output: string, id: string): string {
  const section = output.split(/\n(?=\*\*)/).find(part => part.startsWith('**') && part.split('\n')[0].includes(`\`${id}\``));
  expect(section).toBeDefined();
  return section!;
}

it('marks only the exact relay serving the current request active', async () => {
  const output = await render();
  expect(group(output, 'relay-a')).toContain('← active');
  expect(group(output, 'relay-b')).not.toContain('active');
  expect(group(output, 'openai')).not.toContain('active');
});

it('does not lend a configured relay credential to another endpoint with the same runtime', async () => {
  const output = await render();
  expect(group(output, 'relay-a')).toContain('credential present');
  expect(group(output, 'relay-b')).toContain('credential missing');
});

it.each(['fallback', 'pool'] as const)('uses the resolved %s connection despite an absent shared active ID', async mode => {
  const output = await render({ activeProviderConnectionId: undefined,
    ...(mode === 'pool' ? { accountPool: { openai: { connections: ['a'] } } } : {}) });
  expect(group(output, 'relay-a')).toContain('← active');
  expect(group(output, 'relay-b')).not.toContain('active');
});

it.each(['pending', 'error', 'credential-missing'] as const)('preserves the exact relay %s state beside a ready sibling', async state => {
  const output = await render({ providerConnections: [connection('a'), connection('b', {
    ...(state === 'credential-missing' ? { apiKey: undefined } : { status: state }),
  })] });
  expect(group(output, 'relay-a')).toContain('credential present');
  expect(group(output, 'relay-b')).toContain(state === 'pending' ? 'setup pending' : state === 'error' ? 'setup error' : 'credential missing');
  expect(group(output, 'relay-b')).not.toContain('credential present');
});

it('does not label a named connection ready by borrowing an ambient provider credential', async () => {
  const output = await render({ providerConnections: [connection('a', { apiKey: undefined })],
    providerCredentials: { openai: { apiKey: 'synthetic-profile' } } });
  expect(group(output, 'relay-a')).toContain('← active');
  // The current legacy request can resolve ambient auth at A, but B has no such source.
  expect(group(output, 'relay-b')).toContain('credential missing');
  const other = await render({ providerConnections: [connection('a'), connection('b', { apiKey: undefined })],
    providerCredentials: { openai: { apiKey: 'synthetic-profile' } } });
  expect(group(other, 'relay-b')).toContain('credential missing');
});

it('keeps a provider-slot credential on its exact configured endpoint', async () => {
  const output = await render({ activeProviderConnectionId: undefined, providerConnections: [],
    providerCredentials: { openai: { apiKey: 'synthetic-profile', baseUrl: address('b'), model: 'shared' } } });
  expect(group(output, 'relay-b')).toContain('credential present');
  expect(group(output, 'relay-b')).toContain('← active');
  expect(group(output, 'relay-a')).toContain('credential missing');
  expect(group(output, 'relay-a')).not.toContain('active');
});

it('uses captured request overrides without marking the raw active endpoint current', async () => {
  const output = await render({}, catalog, candidate => resolveProviderCredential({ runtimeConfig: candidate, env: {},
    cliApiKey: 'synthetic-override', cliBaseUrl: address('b'), cliModel: 'shared' }));
  expect(group(output, 'relay-b')).toContain('← active');
  expect(group(output, 'relay-a')).not.toContain('active');
  expect(group(output, 'relay-a')).toContain('credential present');
});

it('does not borrow the authorized pool credential for an excluded endpoint', async () => {
  const output = await render({ providerConnections: [connection('a'), connection('b')],
    accountPool: { openai: { connections: ['a'] } } });
  expect(group(output, 'relay-a')).toContain('credential present');
  expect(group(output, 'relay-b')).toContain('account pool unavailable');
  expect(group(output, 'relay-b')).not.toContain('active');
});

it('does not mark a blocked request active and retains an empty pool', async () => {
  const output = await render({ accountPool: { openai: { connections: [] } } });
  for (const provider of catalog) {
    expect(group(output, provider.id)).not.toContain('active');
    expect(group(output, provider.id)).toContain('account pool empty');
  }
});

it('does not invent an active request when no credential is resolved', async () => {
  const output = await render({ providerConnections: [connection('a', { apiKey: undefined })] });
  expect(output).not.toContain('← active');
  expect(group(output, 'relay-a')).not.toContain('active');
  expect(group(output, 'relay-a')).toContain('credential missing');
});

it('keeps duplicate endpoint ownership unverified without selecting by catalogue order', async () => {
  const providers = [...catalog, { ...catalog[1], id: 'duplicate' }];
  const output = await render({}, providers);
  for (const id of ['relay-a', 'duplicate']) {
    expect(group(output, id)).toContain('unverified');
    expect(group(output, id)).not.toContain('active');
    expect(group(output, id)).not.toContain('credential present');
  }
});

it('keeps an ambient endpoint ambiguity separate from an unrelated missing relay', async () => {
  const providers = [...catalog, { ...catalog[1], id: 'duplicate' }];
  const output = await render({ activeProviderConnectionId: undefined, providerConnections: [],
    providerCredentials: { openai: { apiKey: 'synthetic-profile', baseUrl: address('a'), model: 'shared' } } }, providers);
  expect(group(output, 'relay-a')).toContain('unverified');
  expect(group(output, 'duplicate')).toContain('unverified');
  expect(group(output, 'relay-b')).toContain('credential missing');
  expect(output).not.toContain('← active');
});

it('recognizes trailing-slash equivalence and keeps canonical metadata for unlisted endpoints', async () => {
  const exact = await render({ providerConnections: [connection('a', { baseUrl: `${address('a')}/` })] });
  expect(group(exact, 'relay-a')).toContain('← active');
  const unlisted = await render({ providerConnections: [connection('a', { baseUrl: address('unlisted') })] });
  expect(group(unlisted, 'openai')).toContain('← active');
  expect(group(unlisted, 'relay-a')).not.toContain('active');
});

it('takes account endpoint ownership from the issuer instead of catalogue relocation', async () => {
  const providers = [{ ...catalog[0], baseUrl: 'https://api.openai.com/v1' }, { ...catalog[1], baseUrl: 'https://chatgpt.com/backend-api', id: 'issuer' },
    { ...catalog[2], baseUrl: address('relocated') }];
  const output = await render({ providerConnections: [connection('a', { authType: 'account-auth', apiKey: undefined,
    baseUrl: undefined, accountAuth: { openai: { type: 'openai-chatgpt-account', accessToken: 'synthetic-account' } } })] }, providers);
  expect(group(output, 'issuer')).toContain('← active');
  expect(group(output, 'issuer')).toContain('credential present');
  expect(group(output, 'relay-b')).not.toContain('active');
});

it('preserves account issuer routing even when the canonical catalogue address differs', async () => {
  const output = await render({ providerConnections: [connection('a', { authType: 'account-auth', apiKey: undefined,
    baseUrl: undefined, accountAuth: { openai: { type: 'openai-chatgpt-account', accessToken: 'synthetic-account' } } })] },
    [catalog[0], { ...catalog[1], id: 'issuer', baseUrl: 'https://chatgpt.com/backend-api' }]);
  expect(group(output, 'issuer')).toContain('← active');
  expect(group(output, 'issuer')).toContain('credential present');
  expect(group(output, 'openai')).not.toContain('active');
});

it('keeps the session pool affinity unchanged while inspecting every exact connection', async () => {
  const config = { ...getRuntimeConfig(root), provider: 'openai' as const, activeProviderConnectionId: undefined,
    providerConnections: [connection('a'), connection('b')], providerCredentials: {},
    accountPool: { openai: { connections: ['a', 'b'] } } };
  const sessionId = 'catalog-inspection-affinity';
  selectPooledConnection({ config, provider: 'openai', connectionId: 'a', sessionId });
  const resolve = (candidate: RuntimeConfig, id?: string) => resolveProviderCredential({ runtimeConfig: candidate, env: {}, pool: { sessionId: id } });
  const before = resolve(config, sessionId);
  const result = await runModelCommand([], { cwd: root, sessionId,
    readConfiguration: () => ({ config, catalog }), resolveConfigTarget: resolve });
  expect(group(result.output, 'relay-a')).toContain('← active');
  expect(resolve(config, sessionId).credential).toEqual(before.credential);
});

it('keeps independent provider credentials visible when a CLI provider override selects another runtime', async () => {
  const providers = [...catalog, { id: 'anthropic', runtime: 'anthropic' as const, auth: 'api-key' as const,
    label: 'Other provider', baseUrl: address('other'), models: [{ id: 'other' }] }];
  const output = await render({ providerCredentials: { anthropic: { apiKey: 'synthetic-independent' } } }, providers,
    candidate => resolveProviderCredential({ runtimeConfig: candidate, env: {}, cliProvider: 'openai', cliApiKey: 'synthetic-cli' }));
  expect(group(output, 'anthropic')).toContain('credential present');
  expect(group(output, 'anthropic')).not.toContain('active');
});

it.each(['deleted', 'missing'] as const)('preserves the refusal of a pool with a %s member', async mode => {
  const output = await render({ activeProviderConnectionId: undefined,
    providerConnections: mode === 'deleted' ? [] : [connection('a', { apiKey: undefined })],
    accountPool: { openai: { connections: ['a'] } } });
  for (const provider of catalog) {
    expect(group(output, provider.id)).toContain('account pool unavailable');
    expect(group(output, provider.id)).not.toContain('active');
  }
});

it.each(['pending', 'error', 'pool-unavailable'] as const)('keeps an issuer-owned account %s without a stored URL', async state => {
  const providers = [...catalog, { ...catalog[1], id: 'issuer', baseUrl: 'https://chatgpt.com/backend-api' }];
  const output = await render({ providerConnections: [connection('a'), connection('account', {
    authType: 'account-auth', baseUrl: undefined, apiKey: undefined,
    ...(state === 'pool-unavailable' ? {} : { status: state }),
    accountAuth: { openai: { type: 'openai-chatgpt-account', accessToken: 'synthetic-account' } },
  })], ...(state === 'pool-unavailable' ? { accountPool: { openai: { connections: ['a'] } } } : {}) }, providers);
  expect(group(output, 'issuer')).toContain(state === 'pending' ? 'setup pending' : state === 'error' ? 'setup error' : 'account pool unavailable');
  expect(group(output, 'issuer')).not.toContain('credential present');
});
