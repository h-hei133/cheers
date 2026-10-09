import { readFileSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import { createServer as httpServer, type Server, type ServerResponse } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { requestBrowser, requestPublic } from './connection.js';
import { requestScope } from './request.js';
import { readResponseText } from './response.js';

// This local fixture explicitly substitutes address admission; address.test.ts checks real policy.
const fixture = vi.hoisted(() => ({ ca: undefined as Buffer | undefined, lookup: vi.fn(), request: vi.fn(), ignoresSignal: false }));
vi.mock('node:http', async () => {
  const actual = await vi.importActual<typeof import('node:http')>('node:http');
  return { ...actual, request: (url: URL, options: import('node:http').RequestOptions, callback: (response: import('node:http').IncomingMessage) => void) =>
    actual.request(url, fixture.ignoresSignal ? { ...options, signal: undefined } : options, callback) };
});
vi.mock('./address.js', async () => ({
  ...await vi.importActual<typeof import('./address.js')>('./address.js'),
  publicLookup: async () => fixture.lookup,
}));
vi.mock('node:https', async () => {
  const actual = await vi.importActual<typeof import('node:https')>('node:https');
  return { ...actual, request: (url: URL, options: object, callback: (response: import('node:http').IncomingMessage) => void) => {
    fixture.request(options);
    return actual.request(url, { ...options, ca: fixture.ca }, callback);
  } };
});
const key = readFileSync(new URL('../../test-utils/network/key.pem', import.meta.url));
const cert = readFileSync(new URL('../../test-utils/network/cert.pem', import.meta.url));
let server: Server;
let handler: (response: ServerResponse) => void;
let host: string | undefined;
let sni: string | false | undefined;

async function listen(tls = false, addressFamily: 'ipv4' | 'ipv6' = 'ipv4'): Promise<string> {
  const receive = (request: import('node:http').IncomingMessage, response: ServerResponse): void => {
    host = request.headers.host; handler(response);
  };
  server = tls ? httpsServer({ key, cert }, receive) : httpServer(receive);
  if (tls) server.on('secureConnection', socket => { sni = socket.servername; });
  await new Promise<void>(resolve => server.listen(0, addressFamily === 'ipv6' ? '::1' : '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  return `${tls ? 'https' : 'http'}://public.example:${address.port}`;
}
beforeEach(() => {
  host = undefined; sni = undefined; fixture.ca = cert; fixture.ignoresSignal = false;
  fixture.lookup.mockImplementation((_hostname, options, callback) => options.all
    ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4));
  handler = response => response.end('public text');
});
afterEach(async () => {
  fixture.lookup.mockReset(); fixture.request.mockReset();
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('uses the approved socket lookup while preserving Host and TLS identity', async () => {
  const url = await listen(true); const scope = requestScope(2000);
  try {
    const response = await requestPublic(url, { maxBytes: 1024 }, scope);
    expect(await readResponseText(response, scope, 1024)).toBe('public text');
    expect(fixture.lookup).toHaveBeenCalled();
    expect(host).toBe(new URL(url).host); expect(sni).toBe('public.example');
    expect(fixture.request).toHaveBeenCalledWith(expect.objectContaining({ agent: false, rejectUnauthorized: true, servername: 'public.example', lookup: fixture.lookup }));
    await vi.waitFor(() => expect(getEventListeners(scope.signal, 'abort')).toHaveLength(0));
  } finally { scope.dispose(); }
});

it.each(['headers', 'body'] as const)('explicitly aborts held %s and closes its socket when native signal settlement is unavailable', async phase => {
  // Bun's native HTTP abort may close without rejecting held headers. Keep a real
  // socket/server while withholding native signal handling to exercise owner cancellation.
  fixture.ignoresSignal = true;
  let entered!: () => void; const held = new Promise<void>(resolve => { entered = resolve; }); let response!: ServerResponse;
  handler = incoming => { response = incoming; if (phase === 'body') incoming.writeHead(200).flushHeaders(); entered(); };
  const url = (await listen()).replace('public.example', '127.0.0.1'); const control = new AbortController(); const scope = requestScope(2000, control.signal);
  let admitted = 0;
  const pending = requestBrowser(url, { maxBytes: 1024 }, scope, { admitUrl: selected => selected === url, admitAddress: address => address === '127.0.0.1' })
    .then(incoming => { admitted++; return readResponseText(incoming, scope, 1024); });
  const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  try {
    await held; if (phase === 'body') await vi.waitFor(() => expect(admitted).toBe(1));
    const closed = new Promise<void>(resolve => response.once('close', resolve));
    const started = performance.now(); control.abort('PRIVATE_ABORT_REASON');
    await rejected; expect(performance.now() - started).toBeLessThan(1000); await closed;
    expect(response.socket?.destroyed ?? response.destroyed).toBe(true); expect(getEventListeners(scope.signal, 'abort')).toHaveLength(0);
    response.end('LATE_PRIVATE_BODY'); await new Promise(resolve => setImmediate(resolve)); expect(admitted).toBe(phase === 'headers' ? 0 : 1);
  } finally { scope.dispose(); }
});

it('rejects a trusted certificate issued for a different hostname', async () => {
  const url = (await listen(true)).replace('public.example', 'wrong.example');
  const scope = requestScope(2000);
  try { await expect(requestPublic(url, { maxBytes: 1024 }, scope)).rejects.toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }); expect(host).toBeUndefined(); }
  finally { scope.dispose(); }
});

it('rejects an untrusted certificate without disabling verification', async () => {
  fixture.ca = undefined; const url = await listen(true); const scope = requestScope(2000);
  try { await expect(requestPublic(url, { maxBytes: 1024 }, scope)).rejects.toMatchObject({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }); expect(host).toBeUndefined(); }
  finally { scope.dispose(); }
});

it('caps chunked encoded bytes even when concatenated gzip members decode to empty text', async () => {
  const encoded = Buffer.concat(Array.from({ length: 100 }, () => gzipSync('')));
  handler = response => { response.writeHead(200, { 'content-encoding': 'gzip', 'transfer-encoding': 'chunked' }); response.end(encoded); };
  const url = await listen(); const scope = requestScope(2000);
  try {
    const response = await requestPublic(url, { maxBytes: 1024 }, scope);
    expect(response.headers.has('content-length')).toBe(false);
    await expect(readResponseText(response, scope, 1024)).rejects.toMatchObject({ code: 'response_limit' });
  } finally { scope.dispose(); }
});

it('rejects corrupt compressed payloads without returning decoder diagnostics', async () => {
  handler = response => { response.writeHead(200, { 'content-encoding': 'gzip' }); response.end('PRIVATE_CORRUPT_BODY'); };
  const url = await listen(); const scope = requestScope(2000);
  try {
    const response = await requestPublic(url, { maxBytes: 1024 }, scope);
    await expect(readResponseText(response, scope, 1024)).rejects.toMatchObject({ code: 'invalid_response', message: 'invalid_response' });
  } finally { scope.dispose(); }
});

it('rejects unsupported compression before consuming its payload', async () => {
  handler = response => { response.writeHead(200, { 'content-encoding': 'unknown' }); response.write('body'); };
  const url = await listen(); const scope = requestScope(2000);
  try { await expect(requestPublic(url, { maxBytes: 1024 }, scope)).rejects.toMatchObject({ code: 'invalid_response' }); }
  finally { scope.dispose(); }
});

it.each(['gzip', 'deflate', 'br', 'gzip, br'])('decodes supported content encoding %s', async encoding => {
  const input = Buffer.from('public compressed text');
  const encoded = encoding === 'gzip' ? gzipSync(input) : encoding === 'deflate' ? deflateSync(input)
    : encoding === 'br' ? brotliCompressSync(input) : brotliCompressSync(gzipSync(input));
  handler = response => { response.writeHead(200, { 'content-encoding': encoding }); response.end(encoded); };
  const url = await listen(); const scope = requestScope(2000);
  try {
    const response = await requestPublic(url, { maxBytes: 1024 }, scope);
    expect(await readResponseText(response, scope, 1024)).toBe(input.toString());
  } finally { scope.dispose(); }
});

it('connects over IPv6 using the captured lookup result', async () => {
  fixture.lookup.mockImplementation((_hostname, options, callback) => options.all
    ? callback(null, [{ address: '::1', family: 6 }]) : callback(null, '::1', 6));
  const url = await listen(false, 'ipv6'); const scope = requestScope(2000);
  try {
    const response = await requestPublic(url, { maxBytes: 1024 }, scope);
    expect(await readResponseText(response, scope, 1024)).toBe('public text');
    expect(fixture.lookup).toHaveBeenCalled(); expect(host).toBe(new URL(url).host);
  } finally { scope.dispose(); }
});
