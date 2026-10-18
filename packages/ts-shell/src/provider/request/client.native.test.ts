import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const hasNativeRuntime = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0;
const run = promisify(execFile);

// The installed runtime substitutes its own undici shim. A Node option spy
// cannot establish which proxy the executable actually contacts.
it.skipIf(!hasNativeRuntime)('honors native proxy routing and streams, times out and cancels actual bodies', async () => {
  const source = String.raw`
    import assert from 'node:assert/strict';
    import http from 'node:http';
    import net from 'node:net';
    import { createProviderFetchFromEnv } from ${JSON.stringify(new URL('./fetch.ts', import.meta.url).href)};
    const sockets = new Set();
    let connects = 0;
    const origin = http.createServer((req, res) => {
      if (req.url === '/stream') { res.writeHead(200); res.write('first'); }
      else if (req.url === '/buffered') { res.writeHead(200); res.write(Buffer.alloc(512 * 1024)); }
      else res.end('origin');
    });
    const proxy = http.createServer((_req, res) => { res.writeHead(502); res.end(); });
    for (const server of [origin, proxy]) server.on('connection', socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    });
    await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    proxy.on('connect', (req, downstream, head) => {
      assert.equal(req.url, '127.0.0.1:' + origin.address().port);
      connects++;
      const upstream = net.connect(origin.address().port, '127.0.0.1', () => {
        downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(downstream); downstream.pipe(upstream);
      });
      sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
      downstream.on('error', () => upstream.destroy()); upstream.on('error', () => downstream.destroy());
    });
    const url = 'http://127.0.0.1:' + origin.address().port;
    const proxyUrl = 'http://127.0.0.1:' + proxy.address().port;
    for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY']) process.env[name] = proxyUrl;
    try {
      for (const env of [{}, {CHEERS_PROVIDER_PROXY:'off'}, {CHEERS_PROVIDER_PROXY:proxyUrl,CHEERS_PROVIDER_NO_PROXY:'127.0.0.1'}]) {
        assert.equal(await (await createProviderFetchFromEnv({env})(url)).text(), 'origin');
        assert.equal(connects, 0);
      }
      process.env.NO_PROXY = '*';
      const configured = createProviderFetchFromEnv({env:{CHEERS_PROVIDER_PROXY:proxyUrl}});
      assert.equal(await (await configured(url)).text(), 'origin');
      assert.equal(connects, 1);
      const streaming = createProviderFetchFromEnv({env:{}, timeouts:{bodyTimeoutMs:300}});
      const reader = (await streaming(url + '/stream')).body.getReader();
      assert.equal(new TextDecoder().decode((await reader.read()).value), 'first');
      await assert.rejects(reader.read(), error => error instanceof TypeError && error.cause?.code === 'UND_ERR_BODY_TIMEOUT');
      const controller = new AbortController();
      const cancelled = (await streaming(url + '/stream', {signal:controller.signal})).body.getReader();
      await cancelled.read();
      const pending = cancelled.read(); controller.abort();
      await assert.rejects(pending, {name:'AbortError'});
      const closed = (await streaming(url + '/stream')).body.getReader();
      await closed.read(); await closed.cancel();
      for (let index = 0; index < 3; index++) await (await streaming(url)).body.cancel();
      const queuedAbort = new AbortController();
      const queued = await streaming(url + '/buffered', {signal:queuedAbort.signal});
      await new Promise(resolve => setTimeout(resolve, 50));
      queuedAbort.abort();
      await assert.rejects(queued.body.getReader().read(), {name:'AbortError'});
      const completedAbort = new AbortController();
      const completed = await streaming(url, {signal:completedAbort.signal});
      await new Promise(resolve => setTimeout(resolve, 50));
      completedAbort.abort();
      await assert.rejects(completed.text(), {name:'AbortError'});
      console.log('native transport passed');
    } finally {
      for (const socket of sockets) socket.destroy();
      origin.close(); proxy.close();
    }
  `;
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:http_proxy|https_proxy|all_proxy|no_proxy|cheers_|openai_|anthropic_|google_)/i.test(name)));
  const result = await run('bun', ['--eval', source], { env, timeout: 15_000 });
  expect(result.stdout).toContain('native transport passed');
}, 20_000);
