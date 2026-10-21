import { createServer, type Server } from 'node:http';
import dns from 'node:dns';
import { afterEach, expect, it, vi } from 'vitest';
import { runOAuthLogin, type OAuthProviderConfig } from './flow.js';
import { startCallbackServer } from './callback.js';
import { loginLifetime, waitForLogin } from './lifetime.js';
import { loginOpenAIAccountViaAuthorizationCodeFlow } from '../../commands/openaiAccountAuth.js';
import { accountToken } from '../../../test-utils/oauth.js';

const config: OAuthProviderConfig = { id: 'test', label: 'Synthetic sign-in', authorizeUrl: 'https://example.invalid/authorize',
  tokenUrl: 'https://example.invalid/token', clientId: 'test-client', scope: 'openid', callbackPort: 0, callbackPath: '/callback' };
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
async function redirect(address: string) {
  const url = new URL(address), target = new URL(url.searchParams.get('redirect_uri')!);
  target.search = new URLSearchParams({ code: 'synthetic-code', state: url.searchParams.get('state')! }).toString();
  await fetch(target).catch(() => undefined);
}
const token = () => new Response(JSON.stringify({ access_token: accountToken('synthetic-access', 'account'), refresh_token: 'synthetic-refresh', expires_in: 3600 }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('settles a closed callback wait and releases its exact bound port', async () => {
  const controller = new AbortController();
  const server = await startCallbackServer({ path: '/callback', port: 0, expectedState: 'state', timeoutMs: 30_000, label: 'Synthetic', signal: controller.signal });
  const rejection = expect(server.received).rejects.toMatchObject({ name: 'AbortError' });
  server.close(); server.close();
  await expect(fetch(server.redirectUri)).rejects.toThrow();
  await rejection; controller.abort();
  const reopened = await startCallbackServer({ path: '/callback', port: Number(new URL(server.redirectUri).port), expectedState: 'next', timeoutMs: 30_000, label: 'Synthetic' });
  expect(reopened.redirectUri).toBe(server.redirectUri); reopened.close();
  await expect(reopened.received).rejects.toMatchObject({ name: 'AbortError' });
});

it('reports only authorization receipt in the browser before the terminal exchanges credentials', async () => {
  const server = await startCallbackServer({ path: '/callback', port: 0, expectedState: 'state', timeoutMs: 30_000, label: 'Synthetic' });
  const response = await fetch(`${server.redirectUri}?code=synthetic-code&state=state`);
  const text = await response.text();
  expect(text).toContain('Authorization received'); expect(text).toContain('check whether sign-in completed');
  expect(text).not.toContain('Signed in'); await expect(server.received).resolves.toEqual({ code: 'synthetic-code', state: 'state' });
});

it('does not bind, display or launch an already cancelled browser flow', async () => {
  const controller = new AbortController(); controller.abort('private abort reason');
  const openBrowser = vi.fn(), onProgress = vi.fn(), fetchImpl = vi.fn();
  await expect(runOAuthLogin(config, { signal: controller.signal, openBrowser, onProgress, fetchImpl: fetchImpl as typeof fetch }))
    .rejects.toMatchObject({ code: 'cancelled', message: 'Synthetic sign-in: sign-in cancelled.' });
  expect(openBrowser).not.toHaveBeenCalled(); expect(onProgress).not.toHaveBeenCalled(); expect(fetchImpl).not.toHaveBeenCalled();
});

it('settles cancellation during localhost resolution and never reopens from its late lookup', async () => {
  const reservation = createServer();
  const port = await new Promise<number>(resolve => reservation.listen(0, '127.0.0.1', () => {
    const address = reservation.address(); if (!address || typeof address === 'string') throw new Error('No port'); resolve(address.port);
  }));
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const controller = new AbortController(), lookup = deferred<void>();
  const original = dns.lookup, calls: unknown[][] = [];
  vi.spyOn(dns, 'lookup').mockImplementation(((...args: unknown[]) => { calls.push(args); lookup.resolve(); }) as typeof dns.lookup);
  const openBrowser = vi.fn(), onProgress = vi.fn();
  const login = runOAuthLogin({ ...config, callbackPort: port }, { signal: controller.signal, openBrowser, onProgress });
  const rejected = expect(login).rejects.toMatchObject({ code: 'cancelled' });
  await lookup.promise; controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const status = await Promise.race([login.then(() => 'success', () => 'cancelled'),
      new Promise<string>(resolve => { timer = setTimeout(() => resolve('pending'), 1000); })]);
    expect(status).toBe('cancelled');
    expect(calls).toHaveLength(1); expect(openBrowser).not.toHaveBeenCalled(); expect(onProgress).not.toHaveBeenCalled();
  } finally {
    if (timer) clearTimeout(timer);
    vi.mocked(dns.lookup).mockRestore();
    const args = calls[0]!;
    const late = deferred<void>(), callback = args.at(-1) as (...args: unknown[]) => void;
    args[args.length - 1] = (...answer: unknown[]) => { callback(...answer); late.resolve(); };
    (original as (...args: unknown[]) => void)(...args);
    await late.promise;
  }
  await rejected;
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(openBrowser).not.toHaveBeenCalled();
  await expect(fetch(`http://localhost:${port}/callback`)).rejects.toThrow();
});

it('reports browser instructions before launching and cancels the actual callback wait', async () => {
  const controller = new AbortController(), displayed = deferred<string>();
  const steps: string[] = [];
  const fetchImpl = vi.fn();
  const login = runOAuthLogin(config, { signal: controller.signal, onProgress: progress => { steps.push('progress'); displayed.resolve(progress.authorizeUrl); },
    openBrowser: () => { steps.push('browser'); }, fetchImpl: fetchImpl as typeof fetch });
  const rejected = expect(login).rejects.toMatchObject({ code: 'cancelled' });
  const address = await displayed.promise;
  expect(steps).toEqual(['progress', 'browser']);
  controller.abort('Bearer synthetic-private-reason'); await rejected;
  expect(fetchImpl).not.toHaveBeenCalled();
  await expect(fetch(new URL(address).searchParams.get('redirect_uri')!)).rejects.toThrow();
});

it('does not launch after the progress consumer cancels and observes a late browser settlement', async () => {
  const controller = new AbortController(), openBrowser = vi.fn();
  await expect(runOAuthLogin(config, { signal: controller.signal, onProgress: () => controller.abort(), openBrowser }))
    .rejects.toMatchObject({ code: 'cancelled' });
  expect(openBrowser).not.toHaveBeenCalled();
  const other = new AbortController(), launched = deferred<void>(), browser = deferred<void>();
  const login = runOAuthLogin(config, { signal: other.signal, openBrowser: () => { launched.resolve(); return browser.promise; } });
  const rejected = expect(login).rejects.toMatchObject({ code: 'cancelled' });
  await launched.promise; other.abort(); await rejected; browser.resolve();
});

it.each(['headers', 'body'] as const)('cancels the native token %s wait without publishing a late credential', async phase => {
  const controller = new AbortController(), dispatched = deferred<void>();
  let server!: Server, tokenSignal: AbortSignal | undefined;
  const received: string[] = [];
  server = createServer((request, response) => {
    let body = ''; request.on('data', chunk => { body += String(chunk); }); request.on('end', () => {
      received.push(body);
      if (phase === 'body') { response.writeHead(200, { 'content-type': 'application/json' }); response.write('{"access_token":"'); }
      dispatched.resolve();
    });
  });
  const tokenUrl = await new Promise<string>(resolve => server.listen(0, '127.0.0.1', () => {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port'); resolve(`http://127.0.0.1:${address.port}`);
  }));
  try {
    const login = runOAuthLogin({ ...config, tokenUrl }, { signal: controller.signal, openBrowser: redirect,
      fetchImpl: (url, init) => { tokenSignal = init?.signal as AbortSignal; return fetch(url, init); } });
    const rejected = expect(login).rejects.toMatchObject({ code: 'cancelled' });
    await dispatched.promise; controller.abort(); await rejected;
    expect(tokenSignal?.aborted).toBe(true); expect(received).toHaveLength(1);
    expect(new URLSearchParams(received[0]).get('code')).toBe('synthetic-code');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('refuses a late success even when a transport ignores cancellation', async () => {
  const controller = new AbortController(), sent = deferred<void>(), response = deferred<Response>();
  const login = runOAuthLogin(config, { signal: controller.signal, openBrowser: redirect,
    fetchImpl: (() => { sent.resolve(); return response.promise; }) as typeof fetch });
  const rejected = expect(login).rejects.toMatchObject({ code: 'cancelled' });
  await sent.promise; controller.abort(); await rejected;
  const late = token(), cancel = vi.spyOn(late.body!, 'cancel'); response.resolve(late);
  await Promise.resolve(); await Promise.resolve(); expect(cancel).toHaveBeenCalledOnce();
});

it.each(['browser', 'headers', 'body'] as const)('keeps the original whole-login deadline during %s waiting', async phase => {
  const original = globalThis.setTimeout;
  let expire: (() => void) | undefined;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((...args: Parameters<typeof setTimeout>) => {
    if (args[1] === 30_000 && !expire) expire = args[0] as () => void;
    return original(...args);
  }) as typeof setTimeout);
  const waiting = deferred<void>(), browser = deferred<void>(), response = deferred<Response>(), body = deferred<unknown>();
  const fetchImpl = vi.fn(async () => {
    if (phase === 'headers') { waiting.resolve(); return response.promise; }
    return { ok: true, json: () => { waiting.resolve(); return body.promise; } } as Response;
  });
  const login = runOAuthLogin(config, { timeoutMs: 30_000,
    openBrowser: phase === 'browser' ? () => { waiting.resolve(); return browser.promise; } : redirect,
    fetchImpl: fetchImpl as typeof fetch });
  const rejected = expect(login).rejects.toMatchObject({ code: 'timeout' });
  await waiting.promise; expect(expire).toBeTypeOf('function'); expire!(); await rejected;
  expect(fetchImpl).toHaveBeenCalledTimes(phase === 'browser' ? 0 : 1);
  browser.resolve(); response.resolve(token()); body.resolve({ access_token: 'late' });
});

it('releases deadline and parent listener and distinguishes deadline from cancellation', async () => {
  vi.useFakeTimers();
  const parent = new AbortController(), remove = vi.spyOn(parent.signal, 'removeEventListener');
  const lifetime = loginLifetime(30_000, parent.signal), never = deferred<void>();
  const rejected = expect(waitForLogin(never.promise, lifetime.signal)).rejects.toMatchObject({ name: 'TimeoutError' });
  await vi.advanceTimersByTimeAsync(30_000); expect(lifetime.signal.aborted).toBe(true); await rejected;
  lifetime.close(); lifetime.close(); expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  never.resolve();
});

it('propagates parent cancellation without exposing its reason or retaining its deadline', async () => {
  vi.useFakeTimers();
  const parent = new AbortController(), lifetime = loginLifetime(30_000, parent.signal);
  parent.abort('Bearer synthetic-private-reason');
  try {
    expect(lifetime.signal.aborted).toBe(true);
    expect(lifetime.signal.reason).toMatchObject({ name: 'AbortError', message: 'Sign-in cancelled.' });
  } finally { lifetime.close(); }
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves the native provider wrapper, progress callback and successful credential proof', async () => {
  const progress = vi.fn(), controller = new AbortController();
  const result = await loginOpenAIAccountViaAuthorizationCodeFlow({ signal: controller.signal, onProgress: progress, openBrowser: redirect,
    fetchImpl: (async () => token()) as typeof fetch });
  expect(progress).toHaveBeenCalledWith({ authorizeUrl: result.authorizeUrl });
  expect(result.accountId).toBe('account'); expect(result.production).toBeDefined();
});

it('keeps manual browser instructions usable when the native launcher is absent', async () => {
  vi.stubEnv('PATH', '/nonexistent/synthetic-browser-launcher');
  const onProgress = vi.fn(progress => { void redirect(progress.authorizeUrl); });
  const result = await runOAuthLogin(config, { onProgress, fetchImpl: (async () => token()) as typeof fetch });
  expect(onProgress).toHaveBeenCalledWith({ authorizeUrl: result.authorizeUrl });
  expect(result.accessToken).toBeTruthy(); await new Promise<void>(resolve => setImmediate(resolve));
});

it.each(['http://example.invalid/authorize', 'https://user:password@example.invalid/authorize', 'https://example.invalid/authorize\x1b', 'https://example.invalid/authorize#secret'])('refuses unsafe authorization instructions before display or browser launch: %s', async authorizeUrl => {
  const controller = new AbortController(), onProgress = vi.fn(() => controller.abort()), openBrowser = vi.fn();
  await expect(runOAuthLogin({ ...config, authorizeUrl }, { signal: controller.signal, onProgress, openBrowser })).rejects.toThrow('safe HTTPS');
  expect(onProgress).not.toHaveBeenCalled(); expect(openBrowser).not.toHaveBeenCalled();
});

it.each([NaN, Infinity, -1, 0, 2_147_483_648])('refuses invalid deadline %s before launching', async timeoutMs => {
  const openBrowser = vi.fn();
  await expect(runOAuthLogin(config, { timeoutMs, openBrowser })).rejects.toThrow('timer limit'); expect(openBrowser).not.toHaveBeenCalled();
});
