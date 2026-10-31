import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveProviderAuthContract, runProviderAccountAuthLogin } from '../auth/providerAuthRuntime.js';
import { toSubscriptionAccountAuthConfig } from '../auth/providerAuthContract.js';
import { accountAuthFor } from '../../provider/request/authorization.js';
import { loginGitHubCopilotViaDeviceFlow } from './subscriptionAccountAuth.js';
import { resolveProviderCredential } from '../shell/providerCredentials.js';
import { getRuntimeConfig, getUserAuthPath } from '../../config/runtimeConfig.js';
import { renewStoredAccount } from '../auth/account/renewal.js';

const homes: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

describe('supported native subscription entrypoint', () => {
  it('offers only the Copilot device flow', () => {
    expect(resolveProviderAuthContract('github-copilot')?.methods).toEqual([{ kind: 'device-code', label: expect.any(String) }]);
    expect(resolveProviderAuthContract('anthropic')).toBeUndefined();
  });
  it('refuses Anthropic account login without setup or network', async () => {
    const onPersisted = vi.fn();
    expect(await runProviderAccountAuthLogin({ provider: 'anthropic', providerLabel: 'Anthropic', onPersisted })).toContain('API key');
    expect(onPersisted).not.toHaveBeenCalled();
  });
  it('binds newly produced credentials to exactly one provider', () => {
    const stored = toSubscriptionAccountAuthConfig({ provider: 'github-copilot', accessToken: 'synthetic-session', refreshToken: 'synthetic-github',
      expiresAt: Date.now() + 600000, baseUrl: 'https://api.individual.githubcopilot.com' });
    expect(accountAuthFor('github-copilot', { accountAuth: stored })).toEqual(stored);
    for (const provider of ['anthropic', 'openai', 'google'] as const) expect(accountAuthFor(provider, { accountAuth: stored })).toBeUndefined();
    expect(accountAuthFor('github-copilot', { accountAuth: { ...stored, provider: undefined } })).toBeUndefined();
  });

  it('runs a device login without a progress callback', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/login/device/code')) return Response.json({ device_code: 'device', user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device', interval: 0.01, expires_in: 1 });
      if (url.endsWith('/login/oauth/access_token')) return Response.json({ access_token: 'synthetic-github' });
      if (url.includes('/copilot_internal/v2/token')) return Response.json({ token: 'tid=x;proxy-ep=proxy.individual.githubcopilot.com',
        expires_at: Math.floor(Date.now() / 1000) + 60 });
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch);
    await expect(loginGitHubCopilotViaDeviceFlow()).resolves.toMatchObject({
      provider: 'github-copilot',
      refreshToken: 'synthetic-github',
      baseUrl: 'https://api.individual.githubcopilot.com',
    });
  });
});

describe('Copilot login persistence and renewal', () => {
  it('stores the native grant and renews it without replacing the long-lived GitHub token', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-login-'));
    homes.push(home);
    vi.stubEnv('HOME', home);
    vi.stubEnv('USERPROFILE', home);
    const workspace = path.join(home, 'workspace');
    fs.mkdirSync(path.join(workspace, '.agents'), { recursive: true });
    const expiresAt = Math.floor(Date.now() / 1000) + 30;
    let calls = 0;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      calls++;
      const url = String(input);
      if (url.endsWith('/login/device/code')) return Response.json({ device_code: 'device', user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device', interval: 0.01, expires_in: 1 });
      if (url.endsWith('/login/oauth/access_token')) return Response.json({ access_token: 'synthetic-github' });
      if (url.includes('/copilot_internal/v2/token')) return Response.json({
        token: calls === 3 ? 'tid=old;proxy-ep=proxy.individual.githubcopilot.com' : 'tid=new;proxy-ep=proxy.individual.githubcopilot.com',
        expires_at: calls === 3 ? expiresAt : Math.floor(Date.now() / 1000) + 3_600,
      });
      throw new Error(`unexpected URL: ${url}`);
    }) as typeof fetch;
    vi.stubGlobal('fetch', fetchImpl);
    const progress = vi.fn();
    const result = await runProviderAccountAuthLogin({ provider: 'github-copilot', providerLabel: 'GitHub Copilot',
      workspaceRoot: workspace, onProgress: progress });
    expect(result).toContain('connected via device code');
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ userCode: 'ABCD-1234' }));
    const config = JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8'));
    expect(config.providerConnections[0]).toMatchObject({ provider: 'github-copilot', status: 'connected',
      accountAuth: { subscription: { type: 'subscription', provider: 'github-copilot',
        refreshToken: 'synthetic-github', baseUrl: 'https://api.individual.githubcopilot.com' } } });
    expect(config.providerCredentials?.['github-copilot']).toBeUndefined();
    const resolution = resolveProviderCredential({ runtimeConfig: getRuntimeConfig(workspace), env: {} });
    const renewed = await renewStoredAccount({ workspaceRoot: workspace, resolution, fetchImpl });
    expect(renewed).toMatchObject({ stored: true, writeState: 'persisted' });
    expect(renewed.accountAuth).toMatchObject({ type: 'subscription', provider: 'github-copilot',
      refreshToken: 'synthetic-github', accessToken: 'tid=new;proxy-ep=proxy.individual.githubcopilot.com',
      baseUrl: 'https://api.individual.githubcopilot.com' });
    const stored = JSON.parse(fs.readFileSync(getUserAuthPath(), 'utf8'));
    expect(stored.providerConnections[0].accountAuth.subscription).toEqual(renewed.accountAuth);
    expect(stored.providerCredentials?.['github-copilot']).toBeUndefined();
    expect(calls).toBe(4);
  });
});
