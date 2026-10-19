import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath } from './runtimeConfig.js';
import { resolveProviderCredential } from '../core/shell/providerCredentials.js';
import { providerAuthorization } from '../provider/request/authorization.js';

describe('persisted subscription credentials', () => {
  const environment = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE,
    CHEERS_HOME_OVERRIDE: process.env.CHEERS_HOME_OVERRIDE };
  let fixture: string;
  let workspace: string;

  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-account-'));
    workspace = path.join(fixture, 'workspace');
    fs.mkdirSync(workspace);
    process.env.HOME = fixture;
    process.env.USERPROFILE = fixture;
    delete process.env.CHEERS_HOME_OVERRIDE;
    fs.mkdirSync(path.dirname(getUserRuntimeConfigPath()), { recursive: true });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  for (const provider of ['github-copilot', 'anthropic'] as const) {
    for (const source of ['connection', 'config'] as const) {
      it(`keeps ${provider} ${source} material through configuration and authorization`, () => {
        const baseUrl = provider === 'github-copilot' ? 'https://api.individual.githubcopilot.com' : 'https://api.anthropic.com/v1';
        const expiresAt = Date.now() + 3_600_000;
        const stored = { type: 'subscription', accessToken: ' synthetic-access ', refreshToken: ' synthetic-refresh ',
          expiresAt, baseUrl: ` ${baseUrl}/ ` };
        const values = source === 'connection'
          ? { activeProviderConnectionId: 'owner', providerConnections: [{ id: 'owner', provider, authType: 'account-auth',
              baseUrl, model: 'model', accountAuth: { subscription: stored }, status: 'connected' }] }
          : { providerCredentials: { [provider]: { baseUrl, model: 'model', accountAuth: { subscription: stored } } } };
        const raw = JSON.stringify({ provider, ...values });
        fs.writeFileSync(getUserRuntimeConfigPath(), raw);
        const config = getRuntimeConfig(workspace);
        expect(config.configValidation.valid).toBe(true);
        const expected = { ...stored, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', baseUrl };
        expect(source === 'connection' ? config.providerConnections[0]?.accountAuth?.subscription
          : config.providerCredentials[provider]?.accountAuth?.subscription).toEqual(expected);
        const resolution = resolveProviderCredential({ runtimeConfig: config, env: {} });
        expect(resolution.credential).toMatchObject({ source, authMode: 'account-auth', accountAuth: expected });
        expect(providerAuthorization({ accountAuth: resolution.credential?.accountAuth }).headers.Authorization).toBe('Bearer synthetic-access');
        expect(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8')).toBe(raw);
      });
    }
  }

  for (const provider of ['openai', 'google'] as const) {
    for (const source of ['config', 'connection', 'pool'] as const) {
      it(`keeps ${provider} ${source} accounts on their owner when a CLI endpoint changes`, () => {
        const baseUrl = provider === 'openai' ? 'https://chatgpt.com/backend-api' : `https://owner.invalid/${provider}/v1`;
        const auth = { type: provider === 'openai' ? 'openai-chatgpt-account' : 'google-gemini-account',
          accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: Date.now() + 3_600_000,
          ...(provider === 'google' ? { clientId: 'synthetic-client' } : {}) };
        const values = source === 'config' ? { providerCredentials: { [provider]: { baseUrl, accountAuth: { [provider]: auth } } } }
          : { activeProviderConnectionId: 'owner',
              ...(source === 'pool' ? { accountPool: { [provider]: { connections: ['owner'], baseUrl } } } : {}),
              providerConnections: [{ id: 'owner', provider, authType: 'account-auth', baseUrl,
                accountAuth: { [provider]: auth }, status: 'connected' }] };
        const raw = JSON.stringify({ provider, ...values });
        fs.writeFileSync(getUserRuntimeConfigPath(), raw);
        const accepted = getRuntimeConfig(workspace);
        const config = source === 'config' ? { ...accepted, sessionConnection: { scope: 'provider' as const, provider } }
          : { ...accepted, sessionConnection: { id: 'owner', provider } };
        const selected = resolveProviderCredential({ runtimeConfig: config, cliBaseUrl: `${baseUrl}/`, env: {} });
        expect(selected).toMatchObject({ baseUrl, credential: { baseUrl, accountAuth: auth } });
        const refused = resolveProviderCredential({ runtimeConfig: config, cliBaseUrl: 'https://foreign.invalid/v1', env: {} });
        expect(refused.blocked).toBe('connection-overridden');
        expect(refused.credential).toBeUndefined();
        expect(JSON.stringify(refused)).not.toContain('synthetic-access');
        expect(fs.readFileSync(getUserRuntimeConfigPath(), 'utf8')).toBe(raw);
      });
    }
    it(`does not lend a provider-level endpoint to the ${provider} connection account`, () => {
      const auth = { type: provider === 'openai' ? 'openai-chatgpt-account' : 'google-gemini-account',
        accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: Date.now() + 3_600_000,
        ...(provider === 'google' ? { clientId: 'synthetic-client' } : {}) };
      fs.writeFileSync(getUserRuntimeConfigPath(), JSON.stringify({ provider, activeProviderConnectionId: 'owner',
        providerCredentials: { [provider]: { baseUrl: 'https://foreign.invalid/v1' } },
        providerConnections: [{ id: 'owner', provider, authType: 'account-auth', accountAuth: { [provider]: auth }, status: 'connected' }] }));
      const config = getRuntimeConfig(workspace);
      const selected = resolveProviderCredential({ runtimeConfig: config, env: {} });
      expect(selected.baseUrl).toBeUndefined();
      expect(selected.credential?.baseUrl).toBeUndefined();
      expect(selected.credential?.accountAuth).toEqual(auth);
      const refused = resolveProviderCredential({ runtimeConfig: config, cliBaseUrl: 'https://foreign.invalid/v1', env: {} });
      expect(refused.credential).toBeUndefined();
      expect(refused.blocked).toBe('connection-overridden');
    });
  }

  it('preserves a subscription on the exact bound pool member', () => {
    const subscription = { type: 'subscription', accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
      expiresAt: Date.now() + 3_600_000 };
    fs.writeFileSync(getUserRuntimeConfigPath(), JSON.stringify({ provider: 'github-copilot',
      accountPool: { 'github-copilot': { connections: ['owner'] } }, activeProviderConnectionId: 'owner',
      providerConnections: [{ id: 'owner', provider: 'github-copilot', authType: 'account-auth',
        model: 'model', accountAuth: { subscription }, status: 'connected' }] }));
    const config = getRuntimeConfig(workspace);
    const resolution = resolveProviderCredential({ runtimeConfig: { ...config,
      sessionConnection: { id: 'owner', provider: 'github-copilot' } }, env: {} });
    expect(resolution.blocked).toBeUndefined();
    expect(resolution.credential).toMatchObject({ source: 'connection', connectionId: 'owner', accountAuth: subscription });
  });

  it.each(['openai', 'google', 'openai-compatible'] as const)('does not admit subscription material for %s', provider => {
    fs.writeFileSync(getUserRuntimeConfigPath(), JSON.stringify({ provider,
      providerCredentials: { [provider]: { accountAuth: { subscription: { type: 'subscription',
        accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', expiresAt: Date.now() + 3_600_000 } } } } }));
    const config = getRuntimeConfig(workspace);
    expect(config.providerCredentials[provider]?.accountAuth).toBeUndefined();
    expect(resolveProviderCredential({ runtimeConfig: config, env: {} }).credential).toBeUndefined();
  });

  for (const provider of ['github-copilot', 'anthropic'] as const) {
    it(`binds ${provider} to the subscription address before CLI overrides`, () => {
      const baseUrl = provider === 'github-copilot' ? 'https://api.individual.githubcopilot.com' : 'https://api.anthropic.com/v1';
      const subscription = { type: 'subscription', accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
        expiresAt: Date.now() + 3_600_000, baseUrl };
      fs.writeFileSync(getUserRuntimeConfigPath(), JSON.stringify({ provider, activeProviderConnectionId: 'owner',
        providerConnections: [{ id: 'owner', provider, authType: 'account-auth', model: 'model',
          accountAuth: { subscription }, status: 'connected' }] }));
      const config = getRuntimeConfig(workspace);
      expect(resolveProviderCredential({ runtimeConfig: config, env: {} }).baseUrl).toBe(baseUrl);
      const refused = resolveProviderCredential({ runtimeConfig: config, cliBaseUrl: 'https://foreign.invalid/v1', env: {} });
      expect(refused.blocked).toBe('connection-overridden');
      expect(refused.credential).toBeUndefined();
      expect(resolveProviderCredential({ runtimeConfig: config, cliBaseUrl: `${baseUrl}/`, env: {} }).credential?.accountAuth).toEqual(subscription);
      const conflicting = { ...config, providerConnections: config.providerConnections.map(connection => ({ ...connection, baseUrl: 'https://foreign.invalid/v1' })) };
      expect(resolveProviderCredential({ runtimeConfig: conflicting, env: {} }).credential).toBeUndefined();
    });
  }
});
