import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliCompressSync, deflateRawSync, deflateSync, gzipSync } from 'node:zlib';
import { Agent } from 'undici/index.js';
import { afterEach, expect, it } from 'vitest';
import { requestFetch } from './client.js';

const servers: http.Server[] = [];
const dispatchers: Agent[] = [];

async function server(handler: http.RequestListener): Promise<string> {
  const instance = http.createServer(handler);
  servers.push(instance);
  await new Promise<void>(resolve => instance.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(instance.address() as AddressInfo).port}`;
}

function client(timeouts: { headersTimeout?: number; bodyTimeout?: number } = {}) {
  const dispatcher = new Agent(timeouts);
  dispatchers.push(dispatcher);
  return (input: RequestInfo | URL, init?: RequestInit) => requestFetch(input, init, () => dispatcher);
}

afterEach(async () => {
  await Promise.all(dispatchers.splice(0).map(dispatcher => dispatcher.destroy()));
  await Promise.all(servers.splice(0).map(instance => {
    instance.closeAllConnections();
    return new Promise<void>(resolve => instance.close(() => resolve()));
  }));
});

it('preserves Request input and init precedence, and refuses pre-aborted requests before dispatch', async () => {
  const seen: unknown[] = [];
  const url = await server(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    seen.push({ method: request.method, body: Buffer.concat(chunks).toString(), owner: request.headers['x-owner'] });
    response.end('done');
  });
  const fetch = client();
  const input = new Request(url, { method: 'POST', body: 'old', headers: { 'x-owner': 'old' } });
  expect(await (await fetch(input, { method: 'PUT', body: 'new', headers: { 'x-owner': 'new' } })).text()).toBe('done');
  const controller = new AbortController(); controller.abort();
  await expect(fetch(url, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(seen).toEqual([{ method: 'PUT', body: 'new', owner: 'new' }]);
});

it('delivers streaming bytes before EOF and rejects a stalled body at its deadline', async () => {
  const url = await server((_request, response) => { response.writeHead(200); response.write('first'); });
  const response = await client({ bodyTimeout: 300 })(url);
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('first');
  await expect(reader.read()).rejects.toMatchObject({ cause: { code: 'UND_ERR_BODY_TIMEOUT' } });
});

it('settles held headers and response bodies on cancellation and closes the socket', async () => {
  for (const stage of ['headers', 'body', 'reader']) {
    let opened!: () => void; let closed!: () => void;
    const started = new Promise<void>(resolve => { opened = resolve; });
    const stopped = new Promise<void>(resolve => { closed = resolve; });
    const url = await server((_request, response) => {
      response.on('close', closed);
      if (stage !== 'headers') { response.writeHead(200); response.write('first'); }
      opened();
    });
    const controller = new AbortController();
    const pending = client()(url, { signal: controller.signal });
    await started;
    if (stage === 'headers') {
      controller.abort();
      await expect(pending).rejects.toBeDefined();
    } else {
      const reader = (await pending).body!.getReader();
      await reader.read();
      if (stage === 'reader') await reader.cancel();
      else { const waiting = reader.read(); controller.abort(); await expect(waiting).rejects.toBeDefined(); }
    }
    await stopped;
  }
});

it('invalidates unread bytes on abort even if the source has already finished', async () => {
  for (const complete of [false, true]) {
    const url = await server((_request, response) => {
      response.writeHead(200);
      if (complete) response.end('complete'); else response.write(Buffer.alloc(512 * 1024));
    });
    const controller = new AbortController();
    const response = await client()(url, { signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 50));
    controller.abort();
    await expect(response.body!.getReader().read()).rejects.toMatchObject({ name: 'AbortError' });
  }
});

it('decodes gzip, deflate, Brotli and stacked encodings on success and error responses', async () => {
  const payload = Buffer.from('{"result":"complete"}');
  for (const [encoding, body] of [
    ['gzip', gzipSync(payload)], ['deflate', deflateSync(payload)], ['br', brotliCompressSync(payload)],
    ['gzip, br', brotliCompressSync(gzipSync(payload))],
  ] as const) {
    const url = await server((_request, response) => {
      response.writeHead(429, { 'content-encoding': encoding, 'content-length': body.length }); response.end(body);
    });
    const response = await client()(url);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ result: 'complete' });
    expect(response.headers.get('content-encoding')).toBe(encoding);
  }
});

it('rejects invalid gzip, a missing gzip trailer and raw bytes mislabeled as zlib deflate', async () => {
  for (const [encoding, body] of [
    ['gzip', Buffer.from('invalid')], ['gzip', gzipSync('complete').subarray(0, -8)], ['deflate', deflateRawSync('complete')],
  ] as const) {
    const url = await server((_request, response) => { response.writeHead(200, { 'content-encoding': encoding }); response.end(body); });
    await expect((await client()(url)).text()).rejects.toBeInstanceOf(TypeError);
  }
});

it('reselects transport on redirects, strips cross-origin credentials and rewrites POST on 302', async () => {
  const seen: unknown[] = [];
  const destination = await server((request, response) => {
    seen.push({ method: request.method, auth: request.headers.authorization, cookie: request.headers.cookie,
      contentType: request.headers['content-type'], length: request.headers['content-length'] });
    response.setHeader('set-cookie', ['a=1', 'b=2']); response.end('done');
  });
  const origin = await server((_request, response) => { response.writeHead(302, { location: destination }); response.end(); });
  const dispatcher = new Agent(); dispatchers.push(dispatcher);
  const hops: string[] = [];
  const response = await requestFetch(origin, { method: 'POST', body: 'payload', headers: {
    authorization: 'Bearer fixture', cookie: 'private=1', 'content-type': 'application/json',
  } }, url => { hops.push(url.origin); return dispatcher; });
  expect(await response.text()).toBe('done');
  expect(hops).toEqual([origin, destination]);
  expect(seen).toEqual([{ method: 'GET', auth: undefined, cookie: undefined, contentType: undefined, length: undefined }]);
  expect(response.url).toBe(destination + '/');
  expect(response.redirected).toBe(true);
  expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
});

it('preserves method and body on 307, supports manual/error, and bounds redirect loops', async () => {
  const bodies: string[] = [];
  const url = await server(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk);
    if (request.url === '/final') { bodies.push(request.method + ':' + Buffer.concat(chunks).toString()); response.end('done'); }
    else { response.writeHead(307, { location: request.url === '/loop' ? '/loop' : '/final' }); response.end('redirect'); }
  });
  const fetch = client();
  expect(await (await fetch(url, { method: 'POST', body: 'keep' })).text()).toBe('done');
  expect(bodies).toEqual(['POST:keep']);
  const manual = await fetch(url, { redirect: 'manual' });
  expect(manual.status).toBe(307); expect(manual.redirected).toBe(false); expect(await manual.text()).toBe('redirect');
  await expect(fetch(url, { redirect: 'error' })).rejects.toThrow('Redirects are disabled');
  await expect(fetch(url + '/loop')).rejects.toThrow('Too many request redirects');
  expect(bodies).toEqual(['POST:keep']);
});

it('uses null response bodies for HEAD and bodyless statuses', async () => {
  const url = await server((request, response) => { response.writeHead(Number(request.url!.slice(1)) || 200); response.end(); });
  const fetch = client();
  for (const status of [204, 205, 304]) expect((await fetch(url + '/' + status)).body).toBeNull();
  expect((await fetch(url, { method: 'HEAD' })).body).toBeNull();
});
