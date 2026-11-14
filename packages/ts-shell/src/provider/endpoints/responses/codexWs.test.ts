import * as http from "node:http";
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocketServer } from "ws";
import { endpointShape } from "../index.js";
import {
  clearCodexWebSocketCache,
  isWebSocketSseFallbackActive,
  markWebSocketSseFallback,
  tryCodexWebSocketFetch,
} from "./codexWs.js";
import { readResponseStream } from "./stream.js";
import { providerFetchForEndpoint } from '../../request/fetch.js';
import { providerRequestError } from '../../request/error.js';
import { withProviderConnections } from '../../request/connection.js';

const servers: Array<() => Promise<void>> = [];

async function startProxy(): Promise<{ url: string; requests: string[] }> {
  const requests: string[] = [];
  const connections = new Set<Duplex>();
  const proxy = http.createServer();
  proxy.on('connect', (request, client, head) => {
    requests.push(request.url!);
    connections.add(client);
    client.on('close', () => connections.delete(client));
    const port = Number(request.url!.split(':').at(-1));
    const target = net.connect(port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) target.write(head);
      client.pipe(target); target.pipe(client);
    });
    connections.add(target);
    target.on('close', () => { connections.delete(target); client.destroy(); });
    target.on('error', () => client.destroy());
    client.on('error', () => target.destroy());
    client.on('close', () => target.destroy());
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  servers.push(async () => {
    for (const socket of connections) socket.destroy();
    proxy.closeAllConnections();
    await new Promise<void>(resolve => proxy.close(() => resolve()));
  });
  return { url: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, requests };
}

afterEach(async () => {
  vi.unstubAllEnvs();
  clearCodexWebSocketCache();
  while (servers.length > 0) {
    await servers.pop()!();
  }
});

async function startWsServer(): Promise<{
  readonly url: string;
  readonly connections: () => number;
  readonly received: unknown[];
}> {
  const received: unknown[] = [];
  let connectionCount = 0;
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: "/codex/responses" });
  wss.on("connection", (ws) => {
    connectionCount++;
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      received.push(msg);
      ws.send(
        JSON.stringify({
          type: "response.output_item.added",
          output_index: 0,
          item: {
            type: "message",
            id: "msg_1",
            role: "assistant",
            status: "in_progress",
            content: [],
          },
        }),
      );
      ws.send(
        JSON.stringify({
          type: "response.output_text.delta",
          item_id: "msg_1",
          output_index: 0,
          content_index: 0,
          delta: "ws-hello",
        }),
      );
      ws.send(
        JSON.stringify({
          type: "response.completed",
          response: {
            id: "resp_ws_1",
            status: "completed",
            model: "gpt-5",
            output: [
              {
                type: "message",
                id: "msg_1",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: "ws-hello" }],
              },
            ],
          },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  servers.push(
    () =>
      new Promise<void>((resolve) => {
        wss.close(() => server.close(() => resolve()));
      }),
  );
  return {
    url: `http://127.0.0.1:${addr.port}/codex/responses`,
    connections: () => connectionCount,
    received,
  };
}

describe("Codex WebSocket transport and SSE fallback", () => {
  it('keeps same-session sockets isolated across runtime owners and lets one owner close without retiring the other', async () => {
    const server = await startWsServer();
    vi.stubEnv('CHEERS_CODEX_TRANSPORT', 'websocket');
    const fetchImpl = providerFetchForEndpoint({}, 'openai-account-responses', endpointShape);
    const first = new AbortController();
    const second = new AbortController();
    const init = { method: 'POST', headers: { authorization: 'Bearer synthetic-same-credential', 'session-id': 'same-session' }, body: '{}' };
    const complete = async () => {
      const response = await fetchImpl(server.url, init);
      await response.text();
    };
    try {
      await withProviderConnections({ id: 'owner-A', signal: first.signal }, complete);
      await withProviderConnections({ id: 'owner-B', signal: second.signal }, complete);
      expect(server.connections()).toBe(2);
      first.abort();
      await withProviderConnections({ id: 'owner-B', signal: second.signal }, complete);
      expect(server.connections()).toBe(2);
      expect(server.received).toHaveLength(3);
    } finally { first.abort(); second.abort(); }
  });
  it('uses production proxy policy and keeps captured NO_PROXY independent of later environment changes', async () => {
    const server = await startWsServer();
    const proxy = await startProxy();
    vi.stubEnv('CHEERS_CODEX_TRANSPORT', 'websocket');
    vi.stubEnv('CHEERS_PROVIDER_PROXY', proxy.url);
    vi.stubEnv('CHEERS_PROVIDER_NO_PROXY', '127.0.0.1');
    const direct = providerFetchForEndpoint({}, 'openai-account-responses', () => ({}));
    vi.stubEnv('CHEERS_PROVIDER_NO_PROXY', '');
    const proxied = providerFetchForEndpoint({}, 'openai-account-responses', () => ({}));
    const init: RequestInit = { method: 'POST', headers: { authorization: 'Bearer fixture', 'session-id': 'policy' }, body: '{}' };
    expect(await (await direct(server.url, init)).text()).toContain('ws-hello');
    expect(proxy.requests).toHaveLength(0);
    expect(await (await proxied(server.url, init)).text()).toContain('ws-hello');
    expect(proxy.requests).toHaveLength(1);
    expect(server.connections()).toBe(2);
  });

  it('classifies a stalled upgrade as a provider timeout without dispatching a response request', async () => {
    const sockets = new Set<net.Socket>();
    const server = http.createServer();
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    server.on('upgrade', () => {});
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); });
    const failure = await tryCodexWebSocketFetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/responses`, {
      method: 'POST', headers: { authorization: 'Bearer fixture' }, body: '{}',
    }, async () => { throw new Error('Unexpected fallback'); }, false, {
      connectTimeoutMs: 500, headersTimeoutMs: 60, bodyTimeoutMs: 500,
    }).then(() => undefined, error => error);
    expect(failure).toMatchObject({ code: 'UND_ERR_HEADERS_TIMEOUT' });
    expect(providerRequestError(failure).failureClass).toBe('provider_timeout');
  });

  it.each(['abort', 'cancel'] as const)('retires a connection after a partial response and %s', async kind => {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });
    let connections = 0;
    wss.on('connection', socket => { connections++; socket.on('message', () => socket.send('{"type":"response.output_text.delta","delta":"partial"}')); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(() => new Promise<void>(resolve => wss.close(() => server.close(() => resolve()))));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/responses`;
    let fallbackCalls = 0;
    const fallback = async () => { fallbackCalls++; return new Response('fallback'); };
    const controller = new AbortController();
    const init: RequestInit = { method: 'POST', headers: { authorization: 'Bearer fixture', 'session-id': 'cancelled' }, body: '{}', signal: controller.signal };
    const reader = (await tryCodexWebSocketFetch(url, init, fallback)).body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('partial');
    if (kind === 'abort') {
      controller.abort();
      await expect(reader.read()).rejects.toMatchObject({ name: 'AbortError' });
    } else await reader.cancel();
    const next = (await tryCodexWebSocketFetch(url, { ...init, signal: undefined }, fallback)).body!.getReader();
    await next.read(); await next.cancel();
    expect(connections).toBe(2);
    expect(fallbackCalls).toBe(0);
  });
  it('uses a configured CONNECT proxy for an otherwise unresolvable provider host', async () => {
    const server = await startWsServer();
    const proxy = await startProxy();
    const target = new URL(server.url); target.hostname = 'provider.invalid';
    const response = await tryCodexWebSocketFetch(target, {
      method: 'POST', headers: { authorization: 'Bearer fixture', 'session-id': 'proxy-session' },
      body: '{"model":"gpt-5"}',
    }, async () => { throw new Error('Unexpected fallback'); }, false, {
      proxyUrl: proxy.url, connectTimeoutMs: 500, headersTimeoutMs: 500, bodyTimeoutMs: 500,
    });
    expect(await response.text()).toContain('ws-hello');
    expect(proxy.requests).toEqual([target.host]);
  });

  it.each([false, true])('bounds an accepted stream before and after its first frame (partial=%s)', async partial => {
    const server = http.createServer();
    const wss = new WebSocketServer({ server });
    wss.on('connection', socket => socket.on('message', () => {
      if (partial) socket.send('{"type":"response.output_text.delta","delta":"partial"}');
    }));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(() => new Promise<void>(resolve => wss.close(() => server.close(() => resolve()))));
    let fallbackCalls = 0;
    const response = await tryCodexWebSocketFetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/responses`, {
      method: 'POST', headers: { authorization: 'Bearer fixture' }, body: '{}',
    }, async () => { fallbackCalls++; return new Response('fallback'); }, true, {
      connectTimeoutMs: 500, headersTimeoutMs: 60, bodyTimeoutMs: 60,
    });
    await expect(response.text()).rejects.toMatchObject({ code: partial ? 'UND_ERR_BODY_TIMEOUT' : 'UND_ERR_HEADERS_TIMEOUT' });
    expect(fallbackCalls).toBe(0);
  });

  it('rechecks authority after socket acquisition and before an SSE fallback', async () => {
    const server = await startWsServer();
    let checks = 0; let fallbackCalls = 0;
    const result = tryCodexWebSocketFetch(server.url, {
      method: 'POST', headers: { authorization: 'Bearer fixture' }, body: '{}',
    }, async () => { fallbackCalls++; return new Response('fallback'); }, true, {
      connectTimeoutMs: 500, headersTimeoutMs: 500, bodyTimeoutMs: 500,
      admission: () => ++checks >= 4 ? 'configuration revoked' : undefined,
    });
    await expect(result).rejects.toThrow('configuration revoked');
    expect(server.received).toHaveLength(0);
    expect(fallbackCalls).toBe(0);
  });
  it("emits session-id and x-client-request-id headers clamped to 64 chars unless cacheRetention is none", () => {
    const shape = endpointShape("openai-account-responses");
    const longId = "a".repeat(80);
    const headers = shape.requestHeaders?.({
      model: "gpt-5",
      provider: "openai",
      systemPrompt: "sys",
      messages: [],
      tools: [],
      allowTools: false,
      vision: false,
      assistantAfterToolResult: false,
      systemRole: "system",
      maxTokensField: "max_tokens",
      supportsTemperature: true,
      temperature: 0.7,
      reasoningEffort: false,
      sessionId: longId,
    });
    expect(headers).toEqual({
      "session-id": "a".repeat(64),
      "x-client-request-id": "a".repeat(64),
    });

    const noneHeaders = shape.requestHeaders?.({
      model: "gpt-5",
      provider: "openai",
      systemPrompt: "sys",
      messages: [],
      tools: [],
      allowTools: false,
      vision: false,
      assistantAfterToolResult: false,
      systemRole: "system",
      maxTokensField: "max_tokens",
      temperature: 0.7,
      reasoningEffort: false,
      sessionId: "sess-1",
      cacheRetention: "none",
    });
    expect(noneHeaders).toEqual({});
  });

  it("streams response frames over WebSocket and reuses cached session connection", async () => {
    const server = await startWsServer();
    const init: RequestInit = {
      method: "POST",
      headers: {
        authorization: "Bearer tok-123",
        "session-id": "sess-reuse",
      },
      body: JSON.stringify({ model: "gpt-5", input: [] }),
    };

    const res1 = await tryCodexWebSocketFetch(server.url, init, async () => {
      throw new Error("should not hit SSE fallback");
    });
    const gen1 = readResponseStream(res1.body!, true);
    let step = await gen1.next();
    while (!step.done) step = await gen1.next();
    expect(step.value.message.content).toBe("ws-hello");

    const res2 = await tryCodexWebSocketFetch(server.url, init, async () => {
      throw new Error("should not hit SSE fallback");
    });
    const gen2 = readResponseStream(res2.body!, true);
    step = await gen2.next();
    while (!step.done) step = await gen2.next();
    expect(step.value.message.content).toBe("ws-hello");

    expect(server.connections()).toBe(1);
    expect(server.received).toHaveLength(2);
    expect((server.received[0] as { type: string }).type).toBe("response.create");
  });

  it("falls back to SSE on WebSocket handshake error and caches fallback for session", async () => {
    const httpOnly = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end("data: sse-fallback\n\n");
    });
    await new Promise<void>((resolve) => httpOnly.listen(0, "127.0.0.1", resolve));
    const addr = httpOnly.address() as { port: number };
    servers.push(() => new Promise<void>((resolve) => httpOnly.close(() => resolve())));

    let sseCalls = 0;
    const sseFallback = async (u: RequestInfo | URL, i?: RequestInit) => {
      sseCalls++;
      return fetch(u, i);
    };

    const init: RequestInit = {
      method: "POST",
      headers: { authorization: "Bearer tok-123", "session-id": "sess-fb" },
      body: JSON.stringify({ model: "gpt-5" }),
    };
    const url = `http://127.0.0.1:${addr.port}/codex/responses`;

    const res1 = await tryCodexWebSocketFetch(url, init, sseFallback);
    expect(await res1.text()).toContain("sse-fallback");
    expect(isWebSocketSseFallbackActive("sess-fb")).toBe(true);

    const res2 = await tryCodexWebSocketFetch(url, init, sseFallback);
    expect(await res2.text()).toContain("sse-fallback");
    expect(sseCalls).toBe(2);

    markWebSocketSseFallback("manual-fb");
    expect(isWebSocketSseFallbackActive("manual-fb")).toBe(true);
  });

  it("isolates cached WebSockets by bearer token", async () => {
    const server = await startWsServer();
    const baseInit = (token: string): RequestInit => ({
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "session-id": "sess-tok" },
      body: JSON.stringify({ model: "gpt-5", input: [] }),
    });

    const r1 = await tryCodexWebSocketFetch(server.url, baseInit("tok-A"), async () => {
      throw new Error("no fallback");
    });
    await r1.text();
    const r2 = await tryCodexWebSocketFetch(server.url, baseInit("tok-B"), async () => {
      throw new Error("no fallback");
    });
    await r2.text();
    expect(server.connections()).toBe(2);
  });

  it("closes stream on response.incomplete and preserves multiline WS payloads in SSE framing", async () => {
    const server = http.createServer();
    const wss = new WebSocketServer({ server, path: "/codex/responses" });
    wss.on("connection", (ws) => {
      ws.on("message", () => {
        ws.send(JSON.stringify({ type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_inc", role: "assistant", status: "in_progress", content: [] } }));
        ws.send(JSON.stringify({ type: "response.output_text.delta", item_id: "msg_inc", output_index: 0, content_index: 0, delta: "partial\nline" }, null, 2));
        ws.send(JSON.stringify({ type: "response.incomplete", response: { id: "resp_inc", status: "incomplete", model: "gpt-5", incomplete_details: { reason: "max_output_tokens" }, output: [{ type: "message", id: "msg_inc", role: "assistant", status: "incomplete", content: [{ type: "output_text", text: "partial\nline" }] }] } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address() as { port: number };
    servers.push(() => new Promise<void>((resolve) => wss.close(() => server.close(() => resolve()))));

    const res = await tryCodexWebSocketFetch(
      `http://127.0.0.1:${addr.port}/codex/responses`,
      { method: "POST", headers: { authorization: "Bearer tok-inc", "session-id": "sess-inc" }, body: JSON.stringify({ model: "gpt-5" }) },
      async () => {
        throw new Error("no fallback");
      },
    );
    const gen = readResponseStream(res.body!, true);
    let step = await gen.next();
    while (!step.done) step = await gen.next();
    expect(step.value.message.content).toBe("partial\nline");
    expect(step.value.finishReason).toBe("length");
  });

  it("does not fall back to SSE or record fallback when aborted", async () => {
    let sseCalls = 0;
    const ac = new AbortController();
    ac.abort(new DOMException("Aborted", "AbortError"));
    await expect(
      tryCodexWebSocketFetch(
        "http://127.0.0.1:1/codex/responses",
        {
          method: "POST",
          headers: { authorization: "Bearer tok", "session-id": "sess-abort" },
          body: JSON.stringify({ model: "gpt-5" }),
          signal: ac.signal,
        },
        async () => {
          sseCalls++;
          return new Response("fallback");
        },
      ),
    ).rejects.toThrow();
    expect(sseCalls).toBe(0);
    expect(isWebSocketSseFallbackActive("sess-abort")).toBe(false);
  });
});
