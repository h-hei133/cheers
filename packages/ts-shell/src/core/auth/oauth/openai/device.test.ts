import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeOAuthLogin } from '../flow.js';
import { openAIOAuthConfig } from '../providers.js';
import { pollOpenAIDeviceAuth, runOpenAIDeviceLogin, startOpenAIDeviceAuth } from './device.js';
import { openAIProviderAuthContract } from '../../../commands/openaiAccountAuth.js';
import { accountToken } from '../../../../test-utils/oauth.js';

const config = openAIOAuthConfig();
const verifier = 'v'.repeat(43);
const start = { deviceAuthId: 'synthetic-device', userCode: 'ABCD-EFGH', verificationUri: 'https://auth.openai.com/codex/device', intervalSeconds: 1 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const startResponse = () => json({ device_auth_id: start.deviceAuthId, user_code: start.userCode, interval: '1' });
const codeResponse = () => json({ authorization_code: 'synthetic-code', code_verifier: verifier });
const tokenResponse = () => json({ access_token: accountToken('synthetic-access', 'synthetic-account'), refresh_token: 'synthetic-refresh', expires_in: 3600 });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('OpenAI device sign-in', () => {
  it('shows instructions before polling, exchanges the exact code redirect, and mints the shared native proof', async () => {
    const steps: string[] = [], openBrowser = vi.fn();
    const fetchImpl = vi.fn(async (address: string | URL | Request, init?: RequestInit) => {
      const url = String(address); steps.push(url);
      expect(init?.redirect).toBe('error'); expect(init?.signal).toBeInstanceOf(AbortSignal);
      if (url.endsWith('/usercode')) { expect(JSON.parse(String(init?.body))).toEqual({ client_id: config.clientId }); return startResponse(); }
      if (url.endsWith('/deviceauth/token')) {
        expect(steps.at(-2)).toBe('display');
        expect(JSON.parse(String(init?.body))).toEqual({ device_auth_id: start.deviceAuthId, user_code: start.userCode });
        return codeResponse();
      }
      expect(url).toBe(config.tokenUrl);
      expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ grant_type: 'authorization_code',
        code: 'synthetic-code', code_verifier: verifier, redirect_uri: 'https://auth.openai.com/deviceauth/callback', client_id: config.clientId });
      return tokenResponse();
    });
    const result = await runOpenAIDeviceLogin(config, { fetchImpl, openBrowser, onProgress: value => {
      expect(value).toEqual({ authorizeUrl: start.verificationUri, userCode: start.userCode }); steps.push('display');
    } });
    expect(openBrowser).not.toHaveBeenCalled(); expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ authorizeUrl: start.verificationUri, callbackUrl: 'https://auth.openai.com/deviceauth/callback', accountId: 'synthetic-account' });
    expect(nativeOAuthLogin(result, config)).toBe(true);
    expect(nativeOAuthLogin({ ...result, refreshToken: 'changed' }, config)).toBe(false);
    expect(nativeOAuthLogin({ ...result, production: {} }, config)).toBe(false);
    expect(nativeOAuthLogin({ ...result, production: undefined }, config)).toBe(false);
    expect(nativeOAuthLogin(result, { ...config, clientId: 'foreign-client' })).toBe(false);
  });

  it('selects device login only explicitly and leaves the default browser adapter in place', async () => {
    const responses = [startResponse(), codeResponse(), tokenResponse()];
    const transport = vi.fn(async () => responses.shift()!); vi.stubGlobal('fetch', transport);
    const progress = vi.fn();
    const result = await openAIProviderAuthContract.loginAccountAuth({ accountMethod: 'device-code', onProgress: progress });
    expect(nativeOAuthLogin(result, config)).toBe(true); expect(progress).toHaveBeenCalledWith({ authorizeUrl: start.verificationUri, userCode: start.userCode });
    expect(openAIProviderAuthContract.methods.map(method => method.kind)).toContain('account-auth');
    expect(openAIProviderAuthContract.methods.map(method => method.kind)).toContain('device-code');
  });

  it('accepts the upstream usercode alias and clamps non-finite cadence', async () => {
    const fetchImpl = vi.fn(async () => json({ device_auth_id: 'synthetic-device', usercode: start.userCode, interval: 'Infinity' }));
    expect(await startOpenAIDeviceAuth(config.clientId, { fetchImpl })).toEqual({ ...start, intervalSeconds: 5 });
  });

  it('polls pending statuses and nested provider codes with the requested slowdown', async () => {
    vi.useFakeTimers(); const times: number[] = [];
    const responses = [new Response('', { status: 404 }), new Response('', { status: 429 }), new Response('', { status: 502 }),
      json({ error: { code: 'deviceauth_authorization_pending' } }, 400), codeResponse()];
    const fetchImpl = vi.fn(async () => { times.push(Date.now()); return responses.shift()!; });
    const promise = pollOpenAIDeviceAuth(start, { fetchImpl });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toEqual({ authorizationCode: 'synthetic-code', codeVerifier: verifier });
    expect(times.slice(1).map((time, index) => time - times[index]!)).toEqual([1000, 6000, 6000, 6000]);
  });

  it.each(['access_denied', 'expired_token', 'PRIVATE_PROVIDER_TOKEN'])('refuses %s without printing the provider error', async error => {
    const fetchImpl = vi.fn(async () => json({ error: { code: error }, access_token: 'PRIVATE_BODY_TOKEN' }, 400));
    await expect(pollOpenAIDeviceAuth(start, { fetchImpl })).rejects.toMatchObject({ code: 'refused', message: 'OpenAI device sign-in: authorization was refused or expired.' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    { device_auth_id: 'synthetic-device', user_code: '\x1b[31mPRIVATE' },
    { device_auth_id: 'synthetic-device', user_code: 'PRIVATE\ncode' },
    { device_auth_id: 'x'.repeat(4097), user_code: start.userCode },
  ])('rejects unsafe device metadata without exposing it', async body => {
    await expect(startOpenAIDeviceAuth(config.clientId, { fetchImpl: async () => json(body) }))
      .rejects.toMatchObject({ code: 'response', message: 'OpenAI device sign-in: returned invalid device metadata.' });
  });

  it('rejects malformed success and oversized response bodies without continuing to exchange', async () => {
    await expect(pollOpenAIDeviceAuth(start, { fetchImpl: async () => json({ authorization_code: 'code', code_verifier: 'short' }) }))
      .rejects.toMatchObject({ code: 'response' });
    const fetchImpl = vi.fn(async () => new Response('PRIVATE'.repeat(20_000)));
    await expect(runOpenAIDeviceLogin(config, { fetchImpl, onProgress: vi.fn() })).rejects.toMatchObject({ code: 'response' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('requires a display and validates the timeout before dispatching native requests', async () => {
    const fetchImpl = vi.fn();
    await expect(runOpenAIDeviceLogin(config, { fetchImpl })).rejects.toMatchObject({ code: 'display' });
    for (const timeoutMs of [NaN, Infinity, 0, -1]) await expect(runOpenAIDeviceLogin(config, { fetchImpl, onProgress: vi.fn(), timeoutMs }))
      .rejects.toThrow('positive finite duration');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not request or poll after cancellation before admission or from the display', async () => {
    const before = new AbortController(); before.abort('PRIVATE_REASON');
    const fetchImpl = vi.fn(async () => startResponse()), onProgress = vi.fn();
    await expect(runOpenAIDeviceLogin(config, { signal: before.signal, fetchImpl, onProgress })).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetchImpl).not.toHaveBeenCalled(); expect(onProgress).not.toHaveBeenCalled();
    const during = new AbortController();
    await expect(runOpenAIDeviceLogin(config, { signal: during.signal, fetchImpl, onProgress: () => during.abort('PRIVATE_REASON') }))
      .rejects.toMatchObject({ code: 'cancelled', message: 'OpenAI account sign-in: sign-in cancelled.' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['start', 'poll', 'exchange'] as const)('cancels a hung %s header wait and discards its ignored-signal late response', async stage => {
    const controller = new AbortController(), dispatched = deferred<void>(), late = deferred<Response>();
    const fetchImpl = vi.fn(async (address: string | URL | Request) => {
      const url = String(address);
      if ((stage === 'start' && url.endsWith('/usercode')) || (stage === 'poll' && url.endsWith('/deviceauth/token')) || (stage === 'exchange' && url === config.tokenUrl)) {
        dispatched.resolve(); return late.promise;
      }
      return url.endsWith('/usercode') ? startResponse() : codeResponse();
    });
    const login = runOpenAIDeviceLogin(config, { signal: controller.signal, fetchImpl, onProgress: vi.fn() });
    const assertion = expect(login).rejects.toMatchObject({ code: 'cancelled', message: 'OpenAI account sign-in: sign-in cancelled.' });
    await dispatched.promise; controller.abort('PRIVATE_REASON'); await assertion;
    const response = tokenResponse(), cancel = vi.spyOn(response.body!, 'cancel'); late.resolve(response);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(cancel).toHaveBeenCalled(); expect(fetchImpl).toHaveBeenCalledTimes(stage === 'start' ? 1 : stage === 'poll' ? 2 : 3);
  });

  it.each(['start', 'poll', 'exchange'] as const)('cancels a stalled %s body without publishing proof', async stage => {
    const controller = new AbortController(), dispatched = deferred<void>(), cancelled = vi.fn();
    const fetchImpl = vi.fn(async (address: string | URL | Request) => {
      const url = String(address);
      if ((stage === 'start' && url.endsWith('/usercode')) || (stage === 'poll' && url.endsWith('/deviceauth/token')) || (stage === 'exchange' && url === config.tokenUrl)) {
        let started = false;
        return new Response(new ReadableStream<Uint8Array>({ pull(stream) {
          if (started) return;
          started = true; stream.enqueue(new TextEncoder().encode('{"private":"')); dispatched.resolve();
        }, cancel: cancelled }));
      }
      return url.endsWith('/usercode') ? startResponse() : codeResponse();
    });
    const login = runOpenAIDeviceLogin(config, { signal: controller.signal, fetchImpl, onProgress: vi.fn() });
    const assertion = expect(login).rejects.toMatchObject({ code: 'cancelled' });
    await dispatched.promise; await new Promise<void>(resolve => setImmediate(resolve));
    controller.abort('PRIVATE_REASON'); await assertion;
    expect(cancelled).toHaveBeenCalled();
  });

  it('times out hung exchange headers after 30 seconds under the default login deadline and discards late credentials', async () => {
    vi.useFakeTimers();
    const controller = new AbortController(), dispatched = deferred<void>(), late = deferred<Response>();
    const published = vi.fn(), rejected = vi.fn();
    let exchangeSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (address: string | URL | Request, init?: RequestInit) => {
      const url = String(address);
      if (url.endsWith('/usercode')) return startResponse();
      if (url.endsWith('/deviceauth/token')) return codeResponse();
      expect(url).toBe(config.tokenUrl);
      exchangeSignal = init?.signal ?? undefined;
      dispatched.resolve();
      return late.promise;
    });
    const login = runOpenAIDeviceLogin(config, { signal: controller.signal, fetchImpl, onProgress: vi.fn() });
    const observed = login.then(published, rejected);
    try {
      await dispatched.promise;
      await vi.advanceTimersByTimeAsync(29_999);
      expect(rejected).not.toHaveBeenCalled(); expect(published).not.toHaveBeenCalled();
      expect(exchangeSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ code: 'timeout', message: `${config.label}: token exchange timed out.` }));
      await observed;
      expect(exchangeSignal?.aborted).toBe(true); expect(published).not.toHaveBeenCalled();
      const response = tokenResponse(), cancel = vi.spyOn(response.body!, 'cancel');
      late.resolve(response); await vi.advanceTimersByTimeAsync(0);
      expect(cancel).toHaveBeenCalled(); expect(response.bodyUsed).toBe(true);
      expect(published).not.toHaveBeenCalled(); expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      controller.abort();
      late.resolve(tokenResponse());
      await observed;
    }
  });

  it('keeps the original whole-login deadline across start, pending poll and exchange', async () => {
    vi.useFakeTimers(); let polls = 0;
    const fetchImpl = vi.fn(async (address: string | URL | Request) => {
      const url = String(address);
      if (url.endsWith('/usercode')) { await new Promise(resolve => setTimeout(resolve, 10_000)); return startResponse(); }
      if (url.endsWith('/deviceauth/token')) return ++polls === 1 ? json({ error: 'authorization_pending' }, 400) : codeResponse();
      return new Promise<Response>(() => undefined);
    });
    const login = runOpenAIDeviceLogin(config, { fetchImpl, onProgress: vi.fn(), timeoutMs: 30_000 });
    const assertion = expect(login).rejects.toMatchObject({ code: 'timeout', message: 'OpenAI account sign-in: sign-in timed out.' });
    await vi.advanceTimersByTimeAsync(29_999); expect(fetchImpl).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('expires the standalone poll while an in-flight transport ignores cancellation', async () => {
    vi.useFakeTimers(); const late = deferred<Response>();
    const fetchImpl = vi.fn(() => late.promise);
    const poll = pollOpenAIDeviceAuth(start, { fetchImpl });
    const assertion = expect(poll).rejects.toMatchObject({ code: 'timeout', message: 'OpenAI device sign-in: timed out.' });
    await vi.advanceTimersByTimeAsync(15 * 60_000); await assertion;
    late.resolve(codeResponse()); await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(0); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['response', 'metadata', 'decode', 'http'] as const)('keeps a failed %s native token exchange report-safe', async kind => {
    const fetchImpl = vi.fn(async (address: string | URL | Request) => {
      const url = String(address);
      if (url.endsWith('/usercode')) return startResponse();
      if (url.endsWith('/deviceauth/token')) return codeResponse();
      if (kind === 'http') return new Response('PRIVATE_BODY_TOKEN', { status: 401 });
      if (kind === 'decode') return new Response('PRIVATE_BODY_TOKEN'.repeat(10_000));
      return json({ access_token: kind === 'metadata' ? 'invalid-account-token' : accountToken('synthetic-access', 'account'),
        refresh_token: 'synthetic-refresh', ...(kind === 'response' ? { expires_in: -1 } : { expires_in: 3600 }) });
    });
    const login = runOpenAIDeviceLogin(config, { fetchImpl, onProgress: vi.fn() });
    await expect(login).rejects.toMatchObject({ code: kind === 'response' ? 'metadata' : kind });
    await expect(login).rejects.not.toThrow(/PRIVATE_BODY_TOKEN|synthetic-access|synthetic-refresh|invalid-account-token/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
