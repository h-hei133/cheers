import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createStepFunction } from "./step.js";
import { resetSessionUsage } from "../observability/usageTelemetry.js";

/**
 * The step against a real HTTP server rather than a stubbed `Response`.
 *
 * This exists because a stub cannot show the difference between a stream that
 * was read and one that was cancelled. A retry loop that releases each attempt's
 * connection in a `finally` looks correct against a fake response object — the
 * fake has no socket to cancel — and against a real one it kills the very stream
 * the caller is about to read. That is exactly the defect this file caught.
 */

const servers: http.Server[] = [];

/** A server that streams one answer, optionally after a delay. */
async function startProvider(options: { readonly delayMs?: number } = {}): Promise<string> {
  const server = http.createServer((request, response) => {
    if (request.url?.endsWith("/chat/completions")) {
      const send = (): void => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "hello" } }] })}\n\n`,
        );
        response.write(
          `data: ${JSON.stringify({
            choices: [{ delta: { content: "" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
          })}\n\n`,
        );
        response.end("data: [DONE]\n\n");
      };
      if (options.delayMs) setTimeout(send, options.delayMs);
      else send();
      return;
    }
    response.writeHead(404);
    response.end("no");
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/v1`;
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("createStepFunction against a real stream", () => {
  it("reads a streamed answer instead of cancelling it", async () => {
    // The failure this guards: releasing the attempt's connection before the
    // body is read produces "This operation was aborted" on a request that
    // succeeded, and every real provider streams.
    const baseUrl = await startProvider();
    resetSessionUsage("sess_real_stream");
    const step = createStepFunction({
      provider: { apiKey: "k", baseUrl, model: "m" },
      workspaceRoot: process.cwd(),
      sessionId: "sess_real_stream",
      systemPrompt: "be brief",
      tools: [],
    });

    const deltas: string[] = [];
    const result = await step(
      [{ role: "user", content: "hi" }],
      undefined,
      { onText: (delta) => deltas.push(delta) },
      { allowTools: true },
    );

    expect(result.stopReason).toBe("stop");
    expect(result.text).toBe("hello");
    expect(deltas.join("")).toBe("hello");
  });

  it("reads a streamed answer that arrives after a delay", async () => {
    const baseUrl = await startProvider({ delayMs: 150 });
    resetSessionUsage("sess_real_delay");
    const step = createStepFunction({
      provider: { apiKey: "k", baseUrl, model: "m" },
      workspaceRoot: process.cwd(),
      sessionId: "sess_real_delay",
      systemPrompt: "be brief",
      tools: [],
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(result.stopReason).toBe("stop");
    expect(result.text).toBe("hello");
  });

  it("reads the body of a retried attempt, not just the first one", async () => {
    // The retry path has to release the discarded attempt and keep the kept one.
    let attempts = 0;
    const server = http.createServer((request, response) => {
      if (request.url?.endsWith("/chat/completions")) {
        attempts += 1;
        if (attempts === 1) {
          response.writeHead(503, { "content-type": "text/plain" });
          response.end("busy");
          return;
        }
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "recovered" } }] })}\n\n`);
        response.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: "stop" }] })}\n\n`,
        );
        response.end("data: [DONE]\n\n");
        return;
      }
      response.writeHead(404);
      response.end("no");
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;

    const step = createStepFunction({
      provider: { apiKey: "k", baseUrl: `http://127.0.0.1:${address.port}/v1`, model: "m" },
      workspaceRoot: process.cwd(),
      sessionId: "sess_real_retry",
      systemPrompt: "be brief",
      tools: [],
      retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 },
    });

    const result = await step([{ role: "user", content: "hi" }], undefined, {}, { allowTools: true });

    expect(attempts).toBe(2);
    expect(result.stopReason).toBe("stop");
    expect(result.text).toBe("recovered");
  });
});
