import { describe, expect, it } from 'vitest';
import { completeGitHubDeviceFlow, nativeCopilotLogin, refreshCopilotToken, startGitHubDeviceFlow } from './copilot/flow.js';
import { assertCopilotAccount, copilotBaseUrl, copilotTokenIdentity } from './copilot/policy.js';
import type { DeviceCodeGrant } from './deviceCode.js';

const grant: DeviceCodeGrant = { deviceCode: 'device', userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', intervalSeconds: 1, expiresInSeconds: 60 };
function scripted(...answers: { body?: unknown; status?: number; text?: string }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let cursor = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    const answer = answers[cursor++] ?? answers.at(-1)!;
    return new Response(answer.text ?? JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 });
  };
  return { calls, fetchImpl };
}
const token = (accessToken = 'tid=session;proxy-ep=proxy.individual.githubcopilot.com') => ({ token: accessToken, expires_at: Math.floor(Date.now() / 1000) + 3600 });

describe('native Copilot device and session exchange', () => {
  it('validates and exposes a native device code', async () => {
    const fixture = scripted({ body: { device_code: 'device', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 } });
    expect(await startGitHubDeviceFlow(fixture)).toMatchObject({ ...grant, intervalSeconds: 5, expiresInSeconds: 900 });
    expect(fixture.calls[0]!.url).toBe('https://github.com/login/device/code');
    expect(fixture.calls[0]!.init.redirect).toBe('error');
  });
  it('polls OAuth then exchanges only the GitHub token for a bounded native session', async () => {
    const response = token();
    const fixture = scripted({ body: { error: 'authorization_pending' } }, { body: { access_token: 'synthetic-github' } }, { body: response });
    const credential = await completeGitHubDeviceFlow({ grant, fetchImpl: fixture.fetchImpl });
    expect(credential).toMatchObject({ provider: 'github-copilot', refreshToken: 'synthetic-github', accessToken: response.token,
      expiresAt: response.expires_at * 1000, baseUrl: 'https://api.individual.githubcopilot.com' });
    expect(fixture.calls).toHaveLength(3);
    expect(fixture.calls[2]!.url).toBe('https://api.github.com/copilot_internal/v2/token');
    expect(new Headers(fixture.calls[2]!.init.headers).get('authorization')).toBe('Bearer synthetic-github');
    expect(fixture.calls.every(call => call.init.redirect === 'error')).toBe(true);
    expect(nativeCopilotLogin(credential)).toBe(true);
    for (const change of [{ provider: 'anthropic' }, { accessToken: 'foreign' }, { refreshToken: 'foreign' }, { expiresAt: credential.expiresAt + 1 },
      { baseUrl: 'https://api.business.githubcopilot.com' }, { production: {} }]) expect(nativeCopilotLogin({ ...credential, ...change })).toBe(false);
  });
  it('retains the long-lived GitHub token on renewal with exact issued expiry', async () => {
    const response = token();
    const fixture = scripted({ body: response });
    const fresh = await refreshCopilotToken({ refreshToken: 'synthetic-github', fetchImpl: fixture.fetchImpl });
    expect(fresh.refreshToken).toBe('synthetic-github');
    expect(fresh.expiresAt).toBe(response.expires_at * 1000);
    expect(fresh.baseUrl).toBe('https://api.individual.githubcopilot.com');
    expect(nativeCopilotLogin(fresh)).toBe(false);
  });
  it('accepts the individual default when renewal omits the audience hint', async () => {
    const response = token('tid=session');
    const fixture = scripted({ body: response });
    const fresh = await refreshCopilotToken({ refreshToken: 'synthetic-github', fetchImpl: fixture.fetchImpl });
    expect(fresh.baseUrl).toBe('https://api.individual.githubcopilot.com');
  });
  it.each([null, [], {}, { token: '' }, { token: '   ', expires_at: 1800000000 }, { token: 't', expires_at: -1 },
    { token: 't', expires_at: 0 }, { token: 't', expires_at: '1800000000' }, { token: 't', expires_at: 1.1 },
    { token: 't', expires_at: null }, { token: 't', expires_at: 9e15 }, { ...token(), error: 'synthetic-body-secret' }])('refuses invalid session response %j', async body => {
    const fixture = scripted({ body });
    await expect(refreshCopilotToken({ refreshToken: 'synthetic-github', fetchImpl: fixture.fetchImpl })).rejects.toThrow(/response|metadata/);
  });
  it.each([400, 401, 403, 500])('does not read or report a refused HTTP %i body', async status => {
    const fixture = scripted({ status, text: 'synthetic-body-secret' });
    await expect(refreshCopilotToken({ refreshToken: 'synthetic-github', fetchImpl: fixture.fetchImpl })).rejects.toThrow(`HTTP ${status}`);
    try { await refreshCopilotToken({ refreshToken: 'synthetic-github', fetchImpl: fixture.fetchImpl }); } catch (error) { expect(String(error)).not.toContain('synthetic-body-secret'); }
  });
  it('does not accept an access_token field in a refused polling response', async () => {
    const fixture = scripted({ status: 400, body: { access_token: 'synthetic-wrong' } });
    await expect(completeGitHubDeviceFlow({ grant, fetchImpl: fixture.fetchImpl })).rejects.toThrow('HTTP 400');
    expect(fixture.calls).toHaveLength(1);
  });
  it('redacts transport and device refusal details', async () => {
    await expect(refreshCopilotToken({ refreshToken: 'synthetic-github', fetchImpl: async () => { throw new Error('synthetic-transport-secret'); } })).rejects.toThrow('GitHub account transport or response failed');
    const fixture = scripted({ body: { error: 'denied', error_description: 'synthetic-body-secret' } });
    await expect(completeGitHubDeviceFlow({ grant, fetchImpl: fixture.fetchImpl })).rejects.toThrow('GitHub sign-in was refused');
  });
  it.each(['file:///bin/sh', 'javascript:alert(1)', 'https://foreign.invalid/login/device', 'https://github.com@foreign.invalid/login/device'])('refuses an untrusted verification URL %s', async verification_uri => {
    const fixture = scripted({ body: { device_code: 'device', user_code: 'ABCD-1234', verification_uri, expires_in: 900 } });
    await expect(startGitHubDeviceFlow(fixture)).rejects.toThrow(/untrusted|invalid/);
  });
  it('cancels before HTTP', async () => {
    const fixture = scripted({ body: token() });
    const signal = AbortSignal.abort();
    await expect(refreshCopilotToken({ refreshToken: 'synthetic-github', fetchImpl: fixture.fetchImpl, signal })).rejects.toThrow();
    expect(fixture.calls).toHaveLength(0);
  });
});

describe('issuer-owned Copilot routing', () => {
  it.each(['individual', 'business', 'enterprise'])('accepts only the native %s gateway', tier => {
    expect(copilotBaseUrl(`tid=x;proxy-ep=proxy.${tier}.githubcopilot.com`)).toBe(`https://api.${tier}.githubcopilot.com`);
  });
  it('requires a tenant and permits only the individual default without an audience hint', () => {
    expect(copilotTokenIdentity('tid=tenant;proxy-ep=proxy.individual.githubcopilot.com')).toEqual({
      tenantId: 'tenant', baseUrl: 'https://api.individual.githubcopilot.com',
    });
    expect(copilotBaseUrl('tid=tenant')).toBe('https://api.individual.githubcopilot.com');
    expect(copilotBaseUrl('tid=tenant', 'https://api.business.githubcopilot.com')).toBe('https://api.business.githubcopilot.com');
    expect(() => copilotBaseUrl('proxy-ep=proxy.individual.githubcopilot.com')).toThrow(/no tenant identity/);
  });
  it('binds the stored account audience to the opaque token', () => {
    const account = {
      type: 'subscription' as const,
      provider: 'github-copilot' as const,
      accessToken: 'tid=tenant;proxy-ep=proxy.individual.githubcopilot.com',
      refreshToken: 'synthetic-github',
      expiresAt: Date.now() + 60_000,
      baseUrl: 'https://api.individual.githubcopilot.com',
    };
    expect(() => assertCopilotAccount(account)).not.toThrow();
    expect(() => assertCopilotAccount({ ...account, baseUrl: 'https://api.business.githubcopilot.com' }))
      .toThrow(/audience conflicts/);
    expect(() => assertCopilotAccount({ ...account, accessToken: 'tid=tenant' })).not.toThrow();
    expect(() => assertCopilotAccount({ ...account, accessToken: 'tid=tenant', baseUrl: 'https://api.business.githubcopilot.com' }))
      .toThrow(/no service audience/);
  });
  it.each(['foreign.invalid', 'proxy.individual.githubcopilot.com.evil.invalid', 'proxy.individual.githubcopilot.com/x',
    'proxy.individual.githubcopilot.com:443', 'user@proxy.individual.githubcopilot.com', ''])('refuses a hostile hint %s', hint => {
    expect(() => copilotBaseUrl(`tid=x;proxy-ep=${hint}`)).toThrow(/unverified|no service audience/);
  });
  it.each([
    'tid=a;tid=b;proxy-ep=proxy.individual.githubcopilot.com',
    'tid=a;proxy-ep=proxy.individual.githubcopilot.com;proxy-ep=proxy.business.githubcopilot.com',
  ])('refuses duplicate token metadata %s', value => expect(() => copilotBaseUrl(value)).toThrow('ambiguous'));
});
