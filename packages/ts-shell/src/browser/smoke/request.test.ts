import { readFileSync } from 'node:fs';
import { createServer, type RequestOptions, type Server } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LookupFunction } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseBrowserPublicReadOnlyWebSmokeConfig } from './config.js';
import { renderBrowserPublicReadOnlyWebSmokeReport } from './report.js';
import { runBrowserPublicReadOnlyWebSmoke } from './runner.js';

const fixture = vi.hoisted(() => ({
  dns: vi.fn(), dispatch: vi.fn(), ca: undefined as Buffer | undefined,
  approved: [] as string[],
}));
vi.mock('node:dns/promises', () => ({ lookup: fixture.dns }));
vi.mock('node:https', async () => {
  const actual = await vi.importActual<typeof import('node:https')>('node:https');
  return { ...actual, request(url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) {
    fixture.dispatch(options);
    // Only an already vetted socket lookup may reach this synthetic TLS server.
    const lookup: LookupFunction = (hostname, lookupOptions, done) => {
      expect(options.lookup).toBeTypeOf('function');
      options.lookup!(hostname, lookupOptions, (error, address, family) => {
        if (error) { done(error, '', 0); return; }
        const addresses = Array.isArray(address) ? address.map(value => value.address) : [address];
        fixture.approved.push(...addresses);
        if (lookupOptions.all) done(null, [{ address: '127.0.0.1', family: 4 }]);
        else done(null, '127.0.0.1', family);
      });
    };
    return actual.request(url, { ...options, ca: fixture.ca, lookup }, callback);
  } };
});

const cert = readFileSync(new URL('../../test-utils/network/cert.pem', import.meta.url));
const key = readFileSync(new URL('../../test-utils/network/key.pem', import.meta.url));
let server: Server;
let origin: string;
let requests: string[];
let handle: (request: IncomingMessage, response: ServerResponse) => void;
const timers = new Set<ReturnType<typeof setInterval>>();

beforeEach(async () => {
  requests = []; fixture.approved = []; fixture.ca = cert;
  fixture.dispatch.mockClear(); fixture.dns.mockReset();
  fixture.dns.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  handle = (_request, response) => { response.writeHead(200, { 'content-type': 'text/plain' }); response.end('public fixture'); };
  server = createServer({ cert, key }, (request, response) => { requests.push(request.method!); handle(request, response); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  origin = `https://public.example:${address.port}`;
});
afterEach(async () => {
  for (const timer of timers) clearInterval(timer);
  timers.clear(); server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

function run(method = 'GET', signal?: AbortSignal) {
  const config = parseBrowserPublicReadOnlyWebSmokeConfig({ env: {
    CHEERS_ENABLE_PUBLIC_WEB_SMOKE: '1', CHEERS_PUBLIC_WEB_SMOKE_URL: `${origin}/`,
    CHEERS_PUBLIC_WEB_SMOKE_METHOD: method, CHEERS_PUBLIC_WEB_SMOKE_BYTE_BUDGET: '256',
    CHEERS_PUBLIC_WEB_SMOKE_TIMEOUT_MS: '2000',
  } });
  return runBrowserPublicReadOnlyWebSmoke({ config, signal });
}

it.each([
  { label: 'private', answers: [{ address: '127.0.0.1', family: 4 }] },
  { label: 'mixed', answers: [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }] },
])('refuses $label DNS before handing off any transport', async ({ answers }) => {
  fixture.dns.mockResolvedValue(answers);
  const result = await run();
  expect(result.receipt?.requestStatus).toBe('blocked');
  expect(result.publicNetworkUsed).toBe(false);
  expect(fixture.dns).toHaveBeenCalledOnce();
  expect(fixture.dispatch).not.toHaveBeenCalled(); expect(requests).toEqual([]);
});

it.each(['GET', 'HEAD'])('uses the vetted socket and preserves the actual %s method', async method => {
  handle = (_request, response) => {
    response.writeHead(200, method === 'HEAD'
      ? { 'content-type': 'text/plain', 'content-length': '8000000', 'content-encoding': 'gzip' }
      : { 'content-type': 'text/plain' });
    response.end(method === 'HEAD' ? undefined : 'public fixture');
  };
  const result = await run(method);
  expect(result.status).toBe('executed'); expect(result.publicNetworkUsed).toBe(true);
  expect(requests).toEqual([method]); expect(fixture.approved).toEqual(['8.8.8.8']);
  expect(fixture.dns).toHaveBeenCalledOnce();
  expect(fixture.dispatch).toHaveBeenCalledWith(expect.objectContaining({
    method, servername: 'public.example', rejectUnauthorized: true, agent: false,
  }));
  if (method === 'HEAD') expect(result.receipt?.evidenceSummary).toContain('HEAD response body excluded');
});

it('stops a chunked producer before consuming its complete over-budget body', async () => {
  let produced = 0;
  let closed = false;
  handle = (_request, response) => {
    response.on('close', () => { closed = true; });
    response.writeHead(200, { 'content-type': 'text/plain', 'transfer-encoding': 'chunked' });
    const timer = setInterval(() => {
      if (response.destroyed) { clearInterval(timer); return; }
      response.write(Buffer.alloc(256, 65));
      if (++produced === 16) { clearInterval(timer); response.end(); }
    }, 5);
    timers.add(timer);
  };
  const result = await run();
  expect(result.receipt?.requestStatus).toBe('unsafe-output');
  expect(result.publicNetworkUsed).toBe(true);
  await vi.waitFor(() => expect(closed).toBe(true));
  expect(produced).toBeLessThan(16);
});

it('bounds decompressed bytes and reports the response without retaining its body', async () => {
  handle = (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain', 'content-encoding': 'gzip' });
    response.end(gzipSync('PRIVATE_RESPONSE_MARKER'.repeat(100)));
  };
  const result = await run();
  expect(result.receipt?.requestStatus).toBe('unsafe-output');
  expect(result.publicNetworkUsed).toBe(true); expect(requests).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_RESPONSE_MARKER');
});

it.each([200, 201])('does not follow Location on an HTTP %s response', async status => {
  handle = (_request, response) => {
    response.writeHead(status, { 'content-type': 'text/plain', location: '/next' }); response.end('public fixture');
  };
  const result = await run();
  expect(result.status).toBe('executed'); expect(requests).toEqual(['GET']);
  expect(result.receipt?.statusCodeSummary).toBe(`http ${status}`);
});

it.each(['redirect', 'content-type'])('keeps network-use evidence after a %s rejection', async reason => {
  handle = (_request, response) => {
    response.writeHead(reason === 'redirect' ? 302 : 200, reason === 'redirect'
      ? { location: 'https://other.example/' } : { 'content-type': 'application/octet-stream' });
    response.end('rejected fixture');
  };
  const result = await run();
  expect(result.receipt?.requestStatus).toBe(reason === 'redirect' ? 'redirect-blocked' : 'unsafe-output');
  expect(result.receipt?.executed).toBe(false); expect(result.publicNetworkUsed).toBe(true);
  expect(requests).toEqual(['GET']);
  expect(renderBrowserPublicReadOnlyWebSmokeReport(result)).toContain('Public network used: yes');
  expect(result.uxSummary?.lines.join('\n')).not.toContain('Not fetched');
  expect(result.evidence).not.toContain('browser-public-readonly-web-executor:public-network-no');
  expect(result.evidence).not.toContain('browser-public-readonly-web-receipt:public-network-no');
});

it('keeps a sent request with no response explicitly unknown', async () => {
  handle = request => { request.socket.destroy(); };
  const result = await run();
  expect(requests).toEqual(['GET']); expect(result.status).toBe('unavailable');
  expect(result.publicNetworkUsed).toBeNull();
  expect(renderBrowserPublicReadOnlyWebSmokeReport(result)).toContain('Public network used: unknown');
  expect(result.evidence).toContain('browser-public-readonly-web-receipt:public-network-unknown');
});

it.each([101, 600])('records rejected HTTP %s headers as observed network use', async status => {
  handle = (_request, response) => {
    response.writeHead(status, status === 101
      ? { connection: 'Upgrade', upgrade: 'unsupported' } : { 'content-type': 'text/plain' });
    response.end('PRIVATE_HTTP_REJECTION_BODY');
  };
  const result = await run();
  expect(requests).toEqual(['GET']);
  expect(result.receipt?.requestStatus).toBe('request-failed');
  expect(result.receipt?.executed).toBe(false); expect(result.publicNetworkUsed).toBe(true);
  expect(result.receipt?.statusCodeSummary).toBe(`http ${status}`);
  expect(renderBrowserPublicReadOnlyWebSmokeReport(result)).toContain('Public network used: yes');
  expect(JSON.stringify(result)).not.toContain('PRIVATE_HTTP_REJECTION_BODY');
});

it.each(['disconnect', 'final'])('observes interim headers before a %s response outcome', async outcome => {
  handle = (_request, response) => {
    response.writeEarlyHints({ link: '</ignored>; rel=preload' }, () => {
      if (outcome === 'disconnect') response.socket?.end();
      else { response.writeHead(200, { 'content-type': 'text/plain' }); response.end('public fixture'); }
    });
  };
  const result = await run();
  expect(requests).toEqual(['GET']); expect(result.publicNetworkUsed).toBe(true);
  expect(result.receipt?.requestStatus).toBe(outcome === 'disconnect' ? 'request-failed' : 'executed');
  expect(result.receipt?.executed).toBe(outcome === 'final');
  expect(result.receipt?.statusCodeSummary).toBe(outcome === 'disconnect' ? 'http 103' : 'http 200');
  expect(renderBrowserPublicReadOnlyWebSmokeReport(result)).toContain('Public network used: yes');
});

it('cancels before DNS or dispatch when its caller is already stopped', async () => {
  const controller = new AbortController(); controller.abort('PRIVATE_ABORT_REASON');
  const result = await run('GET', controller.signal);
  expect(result.status).toBe('cancelled'); expect(result.publicNetworkUsed).toBe(false);
  expect(fixture.dns).not.toHaveBeenCalled(); expect(fixture.dispatch).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain('PRIVATE_ABORT_REASON');
});

it('shares one deadline across the entire redirect chain', async () => {
  vi.useFakeTimers();
  let sent = 0;
  let observed: Awaited<ReturnType<typeof runBrowserPublicReadOnlyWebSmoke>> | undefined;
  const config = parseBrowserPublicReadOnlyWebSmokeConfig({ env: {
    CHEERS_ENABLE_PUBLIC_WEB_SMOKE: '1', CHEERS_PUBLIC_WEB_SMOKE_URL: `${origin}/`,
    CHEERS_PUBLIC_WEB_SMOKE_TIMEOUT_MS: '200',
  } });
  const pending = runBrowserPublicReadOnlyWebSmoke({ config, httpClient: async () => {
    const attempt = ++sent;
    await new Promise(resolve => setTimeout(resolve, 80));
    return attempt < 4
      ? { statusCode: 302, redirectLocation: `/${attempt}`, bodyBytes: 0 }
      : { statusCode: 200, headers: { 'content-type': 'text/plain' }, body: 'final' };
  } }).then(result => { observed = result; return result; });
  try {
    await vi.advanceTimersByTimeAsync(200);
    expect(observed?.receipt?.requestStatus).toBe('timeout');
    expect(sent).toBe(3);
    expect(observed?.publicNetworkUsed).toBe(true);
  } finally {
    await vi.runAllTimersAsync(); await pending; vi.useRealTimers();
  }
});
