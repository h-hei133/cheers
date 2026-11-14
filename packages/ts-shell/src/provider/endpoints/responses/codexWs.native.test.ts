import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

/** A fresh process reads its test CA at startup; no global TLS verification bypass. */
it('verifies target TLS and keeps bearer credentials outside CONNECT headers', async () => {
  const source = String.raw`
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import http from 'node:http';
    import https from 'node:https';
    import net from 'node:net';
    import { WebSocketServer } from 'ws';
    import { providerFetchForEndpoint } from ${JSON.stringify(new URL('../../request/fetch.ts', import.meta.url).href)};
    import { clearCodexWebSocketCache } from ${JSON.stringify(new URL('./codexWs.ts', import.meta.url).href)};
    const sockets = new Set();
    const cert = fs.readFileSync(${JSON.stringify(new URL('../../../test-utils/network/cert.pem', import.meta.url).pathname)});
    const key = fs.readFileSync(${JSON.stringify(new URL('../../../test-utils/network/key.pem', import.meta.url).pathname)});
    const target = https.createServer({cert, key});
    const proxy = http.createServer();
    const wss = new WebSocketServer({server:target});
    let connections = 0; let proxyConnects = 0;
    for (const server of [target, proxy]) server.on('connection', socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    });
    wss.on('connection', (socket, request) => {
      connections++;
      assert.equal(request.headers.authorization, 'Bearer fixture-credential');
      socket.on('message', () => socket.send('{"type":"response.completed","response":{"status":"completed","output":[]}}'));
    });
    proxy.on('connect', (request, client, head) => {
      proxyConnects++;
      assert.equal(request.headers.authorization, undefined);
      assert.equal(request.headers['chatgpt-account-id'], undefined);
      const upstream = net.connect(target.address().port, '127.0.0.1', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        client.pipe(upstream); upstream.pipe(client);
      });
      sockets.add(upstream);
      upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
      upstream.on('error', () => client.destroy()); client.on('close', () => upstream.destroy());
    });
    await new Promise(resolve => target.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    process.env.CHEERS_PROVIDER_PROXY = 'http://127.0.0.1:' + proxy.address().port;
    process.env.CHEERS_PROVIDER_NO_PROXY = '';
    process.env.CHEERS_CODEX_TRANSPORT = 'websocket';
    const transport = providerFetchForEndpoint({providerConnectTimeoutMs:1000,providerHeadersTimeoutMs:1000}, 'openai-account-responses', () => ({}));
    const init = {method:'POST', headers:{authorization:'Bearer fixture-credential','session-id':'tls'}, body:'{}'};
    try {
      const trusted = 'https://public.example:' + target.address().port + '/responses';
      if (process.env.TEST_TRUSTED_CA === '1') {
        assert.match(await (await transport(trusted, init)).text(), /response.completed/);
        assert.equal(connections, 1);
        await assert.rejects(transport(trusted.replace('public.example', 'wrong.example'), init), {code:'ERR_TLS_CERT_ALTNAME_INVALID'});
      } else {
        await assert.rejects(transport(trusted, init), error => /SELF_SIGNED_CERT|UNABLE_TO_VERIFY/.test(error.code));
        assert.equal(connections, 0);
      }
      assert.ok(proxyConnects >= 1);
      console.log('TLS proxy boundaries passed');
    } finally {
      clearCodexWebSocketCache();
      for (const socket of sockets) socket.destroy();
      wss.close(); target.close(); proxy.close();
    }
  `;
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:http_proxy|https_proxy|all_proxy|no_proxy|cheers_|openai_|anthropic_|google_|node_extra_ca_certs|node_tls_reject_unauthorized)/i.test(name)));
  const run = promisify(execFile);
  for (const trusted of [true, false]) {
    const result = await run(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
      env: { ...env, TEST_TRUSTED_CA: trusted ? '1' : '0',
        ...(trusted ? { NODE_EXTRA_CA_CERTS: new URL('../../../test-utils/network/cert.pem', import.meta.url).pathname } : {}) },
      timeout: 8000,
    });
    expect(result.stdout).toContain('TLS proxy boundaries passed');
  }
}, 20_000);

it.each(['handshake', 'cached'] as const)('cancels an open SSE fallback when its connection owner retires (%s)', async mode => {
  const source = String.raw`
    import assert from 'node:assert/strict';
    import http from 'node:http';
    import { providerFetchForEndpoint } from ${JSON.stringify(new URL('../../request/fetch.ts', import.meta.url).href)};
    import { withProviderConnections } from ${JSON.stringify(new URL('../../request/connection.ts', import.meta.url).href)};
    import { clearCodexWebSocketCache, markWebSocketSseFallback } from ${JSON.stringify(new URL('./codexWs.ts', import.meta.url).href)};
    const mode = ${JSON.stringify(mode)};
    const sockets = new Set();
    let upgrades = 0; let requests = 0; let closeResponse;
    const responseClosed = new Promise(resolve => { closeResponse = resolve; });
    const server = http.createServer((request, response) => {
      requests++;
      request.resume();
      response.on('close', closeResponse);
      response.writeHead(200, {'content-type':'text/event-stream'});
      response.write('data: partial\n\n');
    });
    server.on('connection', socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    });
    server.on('upgrade', (_request, socket) => {
      upgrades++;
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
    const bounded = async (promise, label) => {
      let timer;
      try {
        return await Promise.race([promise, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(label)), 1000);
        })]);
      } finally { clearTimeout(timer); }
    };
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    process.env.CHEERS_CODEX_TRANSPORT = 'auto';
    const owner = new AbortController();
    const lifetime = {id:'fixture-fallback-owner', signal:owner.signal};
    const request = new AbortController();
    const sessionId = 'fixture-fallback-session';
    let reader;
    try {
      if (mode === 'cached') markWebSocketSseFallback(sessionId, lifetime);
      const transport = providerFetchForEndpoint({providerConnectTimeoutMs:1000,
        providerHeadersTimeoutMs:1000, providerBodyTimeoutMs:3000}, 'openai-account-responses', () => ({}));
      const response = await withProviderConnections(lifetime, () => transport(
        'http://127.0.0.1:' + server.address().port + '/responses', {
          method:'POST', headers:{authorization:'Bearer fixture-credential', 'session-id':sessionId},
          body:'{}', signal:request.signal,
        }));
      reader = response.body.getReader();
      assert.match(new TextDecoder().decode((await reader.read()).value), /partial/);
      assert.equal(upgrades, mode === 'handshake' ? 1 : 0);
      assert.equal(requests, 1);
      const pending = reader.read().then(value => ({kind:'read', value}), error => ({kind:'error', error}));
      owner.abort();
      assert.equal(request.signal.aborted, false);
      const outcome = await bounded(pending, 'Connection owner did not cancel the open SSE fallback.');
      assert.equal(outcome.kind, 'error');
      assert.equal(outcome.error.name, 'AbortError');
      await bounded(responseClosed, 'Connection owner did not close the SSE response socket.');
      console.log('SSE fallback owner cancellation passed');
    } finally {
      request.abort(); owner.abort();
      if (reader) await reader.cancel().catch(() => {});
      clearCodexWebSocketCache();
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  `;
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(?:http_proxy|https_proxy|all_proxy|no_proxy|cheers_|openai_|anthropic_|google_|node_extra_ca_certs|node_tls_reject_unauthorized)/i.test(name)));
  const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
    env, timeout: 8000,
  });
  expect(result.stdout).toContain('SSE fallback owner cancellation passed');
}, 10_000);
