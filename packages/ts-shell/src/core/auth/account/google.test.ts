import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_PROVIDERS, type CatalogProvider } from '../../models/catalog.js';
import type { ProviderCredentialResolution } from '../credential.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from './target.js';
import { providerAuthorization, renewAccountAuthIfExpiring } from '../../../provider/request/authorization.js';
import { googleOAuthConfig } from '../oauth/providers.js';
import { nativeOAuthLogin, runOAuthLogin } from '../oauth/flow.js';
import { loginGoogleAccountViaAuthorizationCodeFlow } from '../../commands/googleAccountAuth.js';
import { accountToken } from '../../../test-utils/oauth.js';
import { loginOpenAIAccountViaAuthorizationCodeFlow } from '../../commands/openaiAccountAuth.js';
import { openAIOAuthConfig } from '../oauth/providers.js';
import { endpointShape, endpointUrl } from '../../../provider/endpoints/index.js';
import { createProfileContext, withProfile } from '../../paths/profile/context.js';
import { getRuntimeConfig, getUserAuthPath, type RuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import { googleProviderAuthContract } from '../../commands/googleAccountAuth.js';
import { runProviderAccountAuthLogin } from '../providerAuthRuntime.js';
import { renewStoredAccount } from './renewal.js';
import { accountBinding, captureAccountEdit } from './state.js';
import { captureLeaseStore, refreshLeasesPath, refreshLineage } from './lease.js';
import { readLeases } from './lease/state.js';

const scope = 'https://www.googleapis.com/auth/cloud-platform';
const native = { type: 'google-gemini-account' as const, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
  expiresAt: Date.now() + 3600_000, clientId: 'synthetic-client', clientSecret: 'synthetic-secret',
  scopes: [scope], quotaProject: 'synthetic-project' };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function selected(auth = native): ProviderCredentialResolution {
  return { provider: 'google', expectedEnvVarName: 'GOOGLE_API_KEY', credential: { provider: 'google', authMode: 'account-auth',
    source: 'config', envVarName: 'GOOGLE_API_KEY', accountAuth: auth } };
}

describe('Google native OAuth account', () => {
  it('keeps the existing OpenAI login wrapper native proof valid through shared OAuth', async () => {
    const result = await loginOpenAIAccountViaAuthorizationCodeFlow({ openBrowser: async url => {
      const auth = new URL(url), callback = new URL(auth.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', auth.searchParams.get('state')!); callback.searchParams.set('code', 'synthetic-code');
      await fetch(callback).catch(() => undefined);
    }, fetchImpl: async () => Response.json({ access_token: accountToken('wrapper'), refresh_token: 'synthetic-refresh', expires_in: 3600 }) });
    expect(nativeOAuthLogin(result, openAIOAuthConfig())).toBe(true);
  });

  it('requires a billing project before opening a browser or exchanging credentials', async () => {
    vi.stubEnv('GOOGLE_CLOUD_QUOTA_PROJECT', ''); vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    const openBrowser = vi.fn(); const fetchImpl = vi.fn();
    await expect(loginGoogleAccountViaAuthorizationCodeFlow({ clientId: 'synthetic-client', openBrowser, fetchImpl })).rejects.toThrow(/billing project/);
    expect(openBrowser).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('captures own client secret, quota project and omitted granted scope through native login', async () => {
    let requestedScopes: string[] = [];
    const result = await loginGoogleAccountViaAuthorizationCodeFlow({ clientId: 'synthetic-client', clientSecret: '  synthetic-secret  ',
      quotaProject: 'synthetic-project', openBrowser: async url => {
        const auth = new URL(url); requestedScopes = auth.searchParams.get('scope')!.split(/\s+/).sort();
        const callback = new URL(auth.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', auth.searchParams.get('state')!); callback.searchParams.set('code', 'synthetic-code');
        await fetch(callback).catch(() => undefined);
      }, fetchImpl: async (_url, init) => {
        expect(new URLSearchParams(String(init?.body)).get('client_secret')).toBe('synthetic-secret');
        return Response.json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600 });
      } });
    expect(result).toMatchObject({ clientId: 'synthetic-client', clientSecret: 'synthetic-secret', quotaProject: 'synthetic-project', scopes: requestedScopes });
    const config = { ...googleOAuthConfig('synthetic-client', 'synthetic-secret'), quotaProject: 'synthetic-project' };
    expect(nativeOAuthLogin(result, config)).toBe(true);
    expect(nativeOAuthLogin({ ...result, quotaProject: 'foreign-project' }, config)).toBe(false);
    expect(nativeOAuthLogin({ ...result, clientSecret: 'foreign-secret' }, config)).toBe(false);
    expect(nativeOAuthLogin(result, { ...config, quotaProject: 'foreign-project' })).toBe(false);
  });

  it('reuses the existing Gemini codec and native resource without another signer', () => {
    const shape = endpointShape('google-account-generative-ai');
    const api = endpointShape('google-generative-ai');
    expect(shape.turnBody).toBe(api.turnBody); expect(shape.body).toBe(api.body);
    expect(shape.readStream).toBe(api.readStream); expect(shape.readBody).toBe(api.readBody);
    expect(shape.signer).toBeUndefined();
    expect(endpointUrl('https://generativelanguage.googleapis.com', 'google-account-generative-ai', 'gemini-fixture', true))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-fixture:streamGenerateContent?alt=sse');
    expect(shape.headers('synthetic-key')).not.toHaveProperty('x-goog-api-key');
  });

  it('takes the issuer native codec independently of API-key catalogue routing', () => {
    const foreign: CatalogProvider[] = [{ id: 'google', runtime: 'google', label: 'Foreign', auth: 'oauth',
      baseUrl: 'https://foreign.invalid', endpoint: 'openai-compatible', models: [] }];
    for (const catalog of [BUILTIN_PROVIDERS, foreign, []]) {
      expect(providerCredentialBaseUrl(catalog, selected())).toBe('https://generativelanguage.googleapis.com');
      expect(providerCredentialEndpoint(catalog, selected())).toBe('google-account-generative-ai');
    }
    const key = { ...selected(), credential: { ...selected().credential!, accountAuth: undefined, apiKey: 'synthetic-key' } };
    expect(providerCredentialBaseUrl(foreign, key)).toBe('https://foreign.invalid');
  });

  it('refuses compatibility and foreign addresses before a request can be built', () => {
    for (const baseUrl of ['https://foreign.invalid', 'https://generativelanguage.googleapis.com/v1beta/openai']) {
      expect(() => providerCredentialBaseUrl([], { ...selected(), baseUrl })).toThrow(/account issuer/);
    }
  });

  it('requires captured OAuth scopes and quota project and formats native bearer headers', () => {
    const headers = providerAuthorization({ accountAuth: native, endpoint: 'google-account-generative-ai' }).headers;
    expect(new Headers(headers).get('authorization')).toBe('Bearer synthetic-access');
    expect(new Headers(headers).get('x-goog-user-project')).toBe('synthetic-project');
    expect(new Headers(headers).get('x-goog-api-key')).toBeNull();
    const mixed = providerAuthorization({ accountAuth: native, apiKey: 'synthetic-outside-key', endpoint: 'google-account-generative-ai' });
    expect(mixed.mode).toBe('account-auth'); expect(mixed.headers).toEqual(headers);
    for (const patch of [{ scopes: undefined }, { scopes: ['openid'] }, { quotaProject: undefined }, { quotaProject: 'bad\r\nheader' }]) {
      expect(() => providerAuthorization({ accountAuth: { ...native, ...patch }, endpoint: 'google-account-generative-ai' })).toThrow(/Google account/);
    }
    expect(() => providerAuthorization({ accountAuth: native, endpoint: 'openai-compatible' })).toThrow(/account protocol/);
  });

  it('retains own login secret and granted scope through the actual refresh exchange', async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(String(url)).toBe('https://oauth2.googleapis.com/token');
      const form = new URLSearchParams(String(init?.body));
      expect(form.get('client_secret')).toBe('synthetic-secret');
      expect(init?.redirect).toBe('error');
      return Response.json({ access_token: 'synthetic-next', expires_in: 3600, scope });
    };
    const result = await renewAccountAuthIfExpiring({ provider: 'google', credential: { accountAuth: { ...native, expiresAt: 1 } }, fetchImpl });
    expect(result.renewed).toBe(true);
    const { expiresAt: _expiry, ...identity } = native;
    expect(result.accountAuth).toMatchObject({ ...identity, accessToken: 'synthetic-next', refreshToken: 'synthetic-refresh' });
    expect(result.accountAuth!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('refuses any changed granted scope set and inherits an omitted response from the captured grant', async () => {
    const original = { ...native, scopes: [scope, 'openid', 'email'], expiresAt: 1 };
    const changed = await renewAccountAuthIfExpiring({ provider: 'google', credential: { accountAuth: original },
      fetchImpl: async () => Response.json({ access_token: 'synthetic-next', expires_in: 3600, scope }) });
    expect(changed.renewed).toBe(false); expect(changed.production).toBeUndefined(); expect(changed.failure).toBeDefined();
    const omitted = await renewAccountAuthIfExpiring({ provider: 'google', credential: { accountAuth: original },
      fetchImpl: async () => Response.json({ access_token: 'synthetic-next', expires_in: 3600 }) });
    expect(omitted.renewed).toBe(true); expect(omitted.accountAuth).toMatchObject({ scopes: original.scopes });
  });

  it('refuses a narrowed refresh response instead of producing successor material', async () => {
    let sends = 0;
    const result = await renewAccountAuthIfExpiring({ provider: 'google', credential: { accountAuth: { ...native, expiresAt: 1 } },
      fetchImpl: async () => { sends++; return Response.json({ access_token: 'synthetic-next', expires_in: 3600, scope: 'openid email' }); } });
    expect(sends).toBe(1); expect(result.renewed).toBe(false); expect(result.production).toBeUndefined();
    expect(result.failure).toBeDefined(); expect(result.accountAuth?.accessToken).toBe(native.accessToken);
  });

  it('binds the native login capability to actual granted scopes', async () => {
    const config = { ...googleOAuthConfig('synthetic-client'), callbackPort: 0 };
    const result = await runOAuthLogin(config, {
      openBrowser: async url => { const auth = new URL(url); const callback = new URL(auth.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', auth.searchParams.get('state')!); callback.searchParams.set('code', 'synthetic-code');
        await fetch(callback).catch(() => undefined); },
      fetchImpl: async () => Response.json({ access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 3600, scope }),
    });
    expect(result.scopes).toEqual([scope]); expect(nativeOAuthLogin(result, config)).toBe(true);
    expect(nativeOAuthLogin({ ...result, scopes: ['openid'] }, config)).toBe(false);
  });
});

async function inProfile(run: (workspace: string) => Promise<void>): Promise<void> {
  const parent = path.join(process.cwd(), '.tmp'); fs.mkdirSync(parent, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(parent, 'google-native-'));
  const workspace = path.join(fixture, 'workspace'); fs.mkdirSync(workspace);
  try { await withProfile(createProfileContext({ name: 'native', homeDir: fixture, env: {} }), () => run(workspace)); }
  finally { fs.rmSync(fixture, { recursive: true, force: true }); }
}

async function storedLogin(workspace: string): Promise<void> {
  const result = await loginGoogleAccountViaAuthorizationCodeFlow({ clientId: 'synthetic-client', clientSecret: '  synthetic-secret  ',
    quotaProject: 'synthetic-project', openBrowser: async address => {
      const auth = new URL(address), callback = new URL(auth.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', auth.searchParams.get('state')!); callback.searchParams.set('code', 'synthetic-code');
      await fetch(callback).catch(() => undefined);
    }, fetchImpl: async () => Response.json({ access_token: 'synthetic-login', refresh_token: 'synthetic-refresh', expires_in: 30 }) });
  const login = vi.spyOn(googleProviderAuthContract, 'loginAccountAuth').mockResolvedValue(result);
  try {
    const outcome = await runProviderAccountAuthLogin({ provider: 'google', providerLabel: 'Google', workspaceRoot: workspace });
    expect(outcome).toContain('connected via browser login'); expect(outcome).not.toContain('unverified');
  } finally { login.mockRestore(); }
}

function storedConfig(): RuntimeConfigFile { return JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8')); }
function storedResolution(workspace: string): ProviderCredentialResolution {
  return resolveProviderCredential({ runtimeConfig: getRuntimeConfig(workspace), env: {} });
}
function leaseFor(resolution: ProviderCredentialResolution) {
  const account = resolution.credential!.accountAuth!;
  expect(account.type).toBe('google-gemini-account');
  return readLeases(captureLeaseStore(refreshLeasesPath())).leases[refreshLineage({ provider: 'google',
    refreshToken: account.refreshToken, clientId: 'clientId' in account ? account.clientId : undefined })]!;
}

describe('stored Google native login and renewal', () => {
  it('stores an exact native login grant and renews with captured secret, project and scope after environment changes', async () => {
    await inProfile(async workspace => {
      await storedLogin(workspace);
      const captured = storedResolution(workspace), before = captured.credential!.accountAuth!;
      expect(leaseFor(captured).grant).toMatchObject({ ...accountBinding(captureAccountEdit(workspace, captured)), origin: 'login' });
      vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'synthetic-foreign-secret'); vi.stubEnv('GOOGLE_CLOUD_QUOTA_PROJECT', 'synthetic-foreign-project');
      const fetchImpl = vi.fn(async (_address, init) => {
        const form = new URLSearchParams(String(init?.body));
        expect(form.get('client_id')).toBe('synthetic-client'); expect(form.get('client_secret')).toBe('synthetic-secret');
        expect(init?.redirect).toBe('error'); expect(leaseFor(captured).attempts[leaseFor(captured).active!]?.phase).toBe('dispatched');
        return Response.json({ access_token: 'synthetic-next', refresh_token: 'synthetic-rotated', expires_in: 3600 });
      }) as unknown as typeof fetch;
      const renewed = await renewStoredAccount({ workspaceRoot: workspace, resolution: captured, fetchImpl });
      expect(renewed).toMatchObject({ stored: true, writeState: 'persisted' }); expect(renewed.rotation).toBeDefined();
      expect(fetchImpl).toHaveBeenCalledOnce();
      const saved = storedConfig(), account = saved.providerConnections![0]!.accountAuth!.google!;
      expect(account).toEqual(saved.providerCredentials!.google!.accountAuth!.google); expect(renewed.accountAuth).toEqual(account);
      expect(account).toMatchObject({ clientSecret: 'synthetic-secret', quotaProject: 'synthetic-project', scopes: 'scopes' in before ? before.scopes : undefined });
      const successor = storedResolution(workspace);
      expect(leaseFor(successor).grant).toMatchObject({ ...accountBinding(captureAccountEdit(workspace, successor)), origin: 'rotation' });
      expect(fs.readFileSync(refreshLeasesPath(), 'utf8')).not.toMatch(/synthetic-secret|synthetic-refresh|synthetic-next|synthetic-rotated/);
    });
  });

  it.each(['openid email', scope])('keeps changed grant %s unknown after one HTTP, without storage or replay', async granted => {
    await inProfile(async workspace => {
      await storedLogin(workspace); const captured = storedResolution(workspace), before = fs.readFileSync(getUserAuthPath());
      const fetchImpl = vi.fn(async () => Response.json({ access_token: 'synthetic-untrusted', refresh_token: 'synthetic-untrusted-refresh',
        expires_in: 3600, scope: granted })) as unknown as typeof fetch;
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await renewStoredAccount({ workspaceRoot: workspace, resolution: captured, fetchImpl });
        expect(result).toMatchObject({ stored: false, writeState: 'unchanged' }); expect(result.accountAuth).toBeUndefined(); expect(result.rotation).toBeUndefined();
      }
      expect(fetchImpl).toHaveBeenCalledOnce(); expect(fs.readFileSync(getUserAuthPath())).toEqual(before);
      const attempts = Object.values(leaseFor(captured).attempts);
      expect(attempts).toEqual([expect.objectContaining({ phase: 'unknown' })]); expect(attempts[0]?.production).toBeUndefined();
    });
  });

  it.each(['quotaProject', 'clientSecret', 'scopes'] as const)('fences an in-flight %s edit and preserves its exact bytes', async field => {
    await inProfile(async workspace => {
      await storedLogin(workspace); const captured = storedResolution(workspace); let edited: Buffer | undefined;
      const fetchImpl = vi.fn(async () => {
        const config = storedConfig(), connection = config.providerConnections![0]!;
        const account = { ...connection.accountAuth!.google!, ...(field === 'scopes' ? { scopes: [scope] } : { [field]: 'synthetic-other' }) };
        connection.accountAuth = { google: account }; config.providerCredentials!.google!.accountAuth = { google: account };
        fs.writeFileSync(getUserAuthPath(), JSON.stringify(config), { mode: 0o600 }); edited = fs.readFileSync(getUserAuthPath());
        return Response.json({ access_token: 'synthetic-next', refresh_token: 'synthetic-rotated', expires_in: 3600 });
      }) as unknown as typeof fetch;
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await renewStoredAccount({ workspaceRoot: workspace, resolution: captured, fetchImpl });
        expect(result).toMatchObject({ stored: false, writeState: 'unchanged' }); expect(result.accountAuth).toBeUndefined(); expect(result.rotation).toBeUndefined();
      }
      expect(fetchImpl).toHaveBeenCalledOnce(); expect(fs.readFileSync(getUserAuthPath())).toEqual(edited);
      expect(Object.values(leaseFor(captured).attempts)).toEqual([expect.objectContaining({ phase: 'unknown' })]);
    });
  });
});
