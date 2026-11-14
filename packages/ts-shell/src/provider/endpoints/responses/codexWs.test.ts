import * as http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { endpointShape } from "../index.js";
import {
  clearCodexWebSocketCache,
  isWebSocketSseFallbackActive,
  markWebSocketSseFallback,
  tryCodexWebSocketFetch,
} from "./codexWs.js";
import { readResponseStream } from "./stream.js";

const servers: Array<() => Promise<void>> = [];

afterEach(async () => {
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
      temperature: undefined,
      reasoningEffort: undefined,
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
      temperature: undefined,
      reasoningEffort: undefined,
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
    const sseFallback = async (u: string | URL, i?: RequestInit) => {
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
