import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, type RuntimeConfig } from '../../../config/runtimeConfig.js';
import { BUILTIN_PROVIDERS } from '../../../core/models/catalog.js';
import { resolveProviderCredential } from '../../../core/shell/providerCredentials.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import { startupConnection } from './connection.js';

function fixture(overrides: Partial<RuntimeConfig> = {}) {
  const config = { ...DEFAULT_CONFIG, ...overrides } as RuntimeConfig;
  const publication = { config, catalog: BUILTIN_PROVIDERS, admissionBlocked: false };
  const context = { session: { id: 'fresh' }, configuration: { current: publication } };
  const provider = {
    resolveCredentialSnapshot: vi.fn(() => resolveProviderCredential({ runtimeConfig: publication.config, env: {} })),
    providerModeEnv: vi.fn<() => string | undefined>(() => undefined),
  };
  return { publication, context, provider, input: { options: {}, mode: 'interactive' as const, terminal: true,
    context: context as unknown as ShellRuntimeContext, provider } };
}

afterEach(() => vi.unstubAllEnvs());

it.each([
  { options: { resumeSession: true } },
  { options: { continueSession: true } },
  { options: { sessionId: 'existing' } },
  { options: { forkSource: 'existing' } },
  { options: { promptArg: 'explicit prompt' } },
  { options: { printMode: true }, mode: 'print' as const },
  { options: { rpcMode: true }, mode: 'stdin-stream' as const },
  { mode: 'stdin-batch' as const },
  { terminal: false },
])('leaves explicit and headless launches on their own input path (%j)', overrides => {
  const { input, provider } = fixture();
  expect(startupConnection({ ...input, ...overrides })).toBeUndefined();
  expect(provider.resolveCredentialSnapshot).not.toHaveBeenCalled();
});

it('offers setup only after reading the current locally unconfigured publication', () => {
  for (const provider of BUILTIN_PROVIDERS) if (provider.envVar) vi.stubEnv(provider.envVar, undefined);
  const { input, context, publication, provider } = fixture();
  const setup = startupConnection(input)!;
  expect(provider.resolveCredentialSnapshot).not.toHaveBeenCalled();
  expect(setup()).toBe(true);

  vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-environment-fixture');
  expect(setup()).toBe(false);
  vi.stubEnv('ANTHROPIC_API_KEY', undefined);
  publication.config = { ...publication.config, providerCredentials: { openai: { apiKey: 'synthetic-configured-fixture' } } };
  expect(setup()).toBe(false);

  publication.config = { ...publication.config, providerCredentials: {} };
  context.session = { id: 'fresh' };
  expect(setup()).toBe(false);
});

it('honors installed connection intent, a signer, and synthetic mode', () => {
  const saved = fixture({ providerConnections: [{
    id: 'saved', provider: 'openai', authType: 'api-key', status: 'pending',
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }] });
  expect(startupConnection(saved.input)?.()).toBe(false);
  expect(startupConnection(fixture({ provider: 'bedrock' }).input)?.()).toBe(false);
  const synthetic = fixture();
  synthetic.provider.providerModeEnv.mockReturnValue('synthetic');
  expect(startupConnection(synthetic.input)).toBeUndefined();
});
