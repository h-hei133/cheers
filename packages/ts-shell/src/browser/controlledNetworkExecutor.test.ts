import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserActionContract } from "./actionContract.js";
import { createBrowserExecutionRequest } from "./executionContract.js";
import { createBrowserControlledNetworkRunnerManifest } from "./controlledNetworkRunnerManifest.js";
import { createBrowserNetworkAllowlist } from "./networkAllowlist.js";
import { createBrowserSandboxAuthority } from "./sandboxAuthority.js";
import { runBrowserExecutionCommand } from "./executionCommandRunner.js";

describe("controlled HTTP lifetime and access facts", () => {
  const servers: http.Server[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  async function fixture(handle: http.RequestListener, timeoutMs = 1500) {
    let requests = 0;
    const server = http.createServer((request, response) => { requests++; handle(request, response); });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing loopback address");
    const origin = `http://127.0.0.1:${address.port}`;
    const request = createBrowserExecutionRequest({ mode: "future-runtime", action: createBrowserActionContract({
      actionKind: "observe", target: origin, userIntentSummary: "observe controlled response", requiresNetwork: true, requiresAuth: false,
    }) });
    return {
      get requests() { return requests; },
      run: (signal?: AbortSignal) => runBrowserExecutionCommand({
        signal, request,
        sandboxAuthority: createBrowserSandboxAuthority({ mode: "future-runtime" }),
        networkAllowlist: createBrowserNetworkAllowlist({ allowedOrigins: [{ origin, mode: "future-runtime" }], allowPrivateNetworkInTest: true }),
        controlledNetworkRunnerManifest: {
          status: "valid", manifest: createBrowserControlledNetworkRunnerManifest({ allowedLoopbackOrigin: origin, timeoutMs }),
          reason: "explicit local fixture", evidence: [], warnings: [], redactions: [],
        },
      }),
    };
  }

  it("does not dispatch a pre-cancelled request", async () => {
    const local = await fixture((_request, response) => response.end("safe"));
    const controller = new AbortController(); controller.abort();
    const result = await local.run(controller.signal);
    expect(local.requests).toBe(0);
    expect(result.output).toContain("Status: cancelled");
    expect(result.output).toContain("Network access: none");
    expect(result.evidence).toContain("browser-execution-command-runner:no-network-call");
  });

  it("cancels an open body and preserves the observed request", async () => {
    let headers!: () => void;
    let closed!: () => void;
    const received = new Promise<void>(resolve => { headers = resolve; });
    const closure = new Promise<void>(resolve => { closed = resolve; });
    const local = await fixture((_request, response) => {
      response.on("close", closed);
      response.write("safe partial body"); headers();
    });
    const controller = new AbortController();
    const pending = local.run(controller.signal);
    await received;
    // Let the native transport observe the body before cancelling its owner.
    await new Promise(resolve => setTimeout(resolve, 20));
    controller.abort();
    const result = await pending;
    await closure;
    expect(local.requests).toBe(1);
    expect(result.output).toContain("Status: cancelled");
    expect(result.output).toContain("Network access: controlled-loopback");
    expect(result.evidence).not.toContain("browser-execution-command-runner:no-network-call");
  });

  it.each(["drip", "disconnect"])("settles a %s body within the total deadline", async kind => {
    const local = await fixture((_request, response) => {
      response.write("safe partial");
      if (kind === "disconnect") setTimeout(() => response.destroy(), 20);
      else {
        const timer = setInterval(() => response.write("."), 10);
        response.on("close", () => clearInterval(timer));
      }
    }, 100);
    const started = performance.now();
    const result = await local.run();
    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.output).toContain(kind === "drip" ? "Status: timeout" : "Status: request-failed");
    expect(result.output).toContain("Network access: controlled-loopback");
    expect(result.output).toContain("Executed: no");
  });

  it.each(["unsafe", "redirect", "location"])("keeps access facts for a %s response", async kind => {
    const local = await fixture((_request, response) => {
      response.writeHead(kind === "redirect" ? 302 : 200, { location: "https://example.com/" });
      response.end(kind === "unsafe" ? "api_key=synthetic" : "safe controlled body");
    });
    const result = await local.run();
    expect(local.requests).toBe(1);
    expect(result.output).toContain("Network access: controlled-loopback");
    expect(result.output).toContain(`Status: ${kind === "unsafe" ? "unsafe-output" : kind === "redirect" ? "redirect-blocked" : "executed"}`);
    expect(result.output).not.toContain("api_key=synthetic");
  });
});
