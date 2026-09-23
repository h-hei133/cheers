import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProviderFetchFromEnv,
  providerFetchFromTimeouts,
  providerTimeoutsFrom,
  resolveProviderTransportConfig,
} from "./fetch.js";

/**
 * The deadlines a provider request runs against.
 *
 * This exists because the live request path used the global `fetch`, which has
 * none: a provider that accepted the connection and then never answered left the
 * turn waiting forever. Retrying cannot rescue that, because a retry classifies a
 * failure only after a response arrives.
 *
 * The hang is exercised against a real server rather than a stub, for the same
 * reason the crash recorder is: a stubbed response has no socket, so it cannot
 * show that a deadline is what ended the wait.
 */

const servers: http.Server[] = [];

/** A server that accepts a connection and never answers. */
async function startSilentServer(): Promise<string> {
  const server = http.createServer(() => {
    // Deliberately never responds. The request stays open until the client
    // gives up, which is the only thing under test.
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}/v1/chat/completions`;
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    // Sockets held open by a hanging request keep the server from closing, so
    // they are destroyed rather than waited on.
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("resolveProviderTransportConfig", () => {
  it("uses the built-in deadlines when nothing states otherwise", () => {
    const config = resolveProviderTransportConfig({});
    expect(config.connectTimeoutMs).toBe(30_000);
    expect(config.headersTimeoutMs).toBe(120_000);
    expect(config.bodyTimeoutMs).toBe(120_000);
  });

  it("takes the configured deadlines", () => {
    const config = resolveProviderTransportConfig(
      {},
      { connectTimeoutMs: 1_000, headersTimeoutMs: 2_000, bodyTimeoutMs: 3_000 },
    );
    expect(config.connectTimeoutMs).toBe(1_000);
    expect(config.headersTimeoutMs).toBe(2_000);
    expect(config.bodyTimeoutMs).toBe(3_000);
  });

  it("lets the environment win over the configuration", () => {
    // A variable is a statement about this run; a file is a standing preference.
    // Every other setting resolves that way, so this one has to as well.
    const config = resolveProviderTransportConfig(
      { CHEERS_PROVIDER_HEADERS_TIMEOUT_MS: "5000" },
      { headersTimeoutMs: 2_000 },
    );
    expect(config.headersTimeoutMs).toBe(5_000);
  });

  it("ignores a configured value that is not a positive number", () => {
    const config = resolveProviderTransportConfig({}, { connectTimeoutMs: 0 });
    expect(config.connectTimeoutMs).toBe(30_000);
  });
});

describe("providerTimeoutsFrom", () => {
  it("reads the three fields off a configuration object", () => {
    expect(
      providerTimeoutsFrom({
        providerConnectTimeoutMs: 11,
        providerHeadersTimeoutMs: 22,
        providerBodyTimeoutMs: 33,
      }),
    ).toEqual({ connectTimeoutMs: 11, headersTimeoutMs: 22, bodyTimeoutMs: 33 });
  });

  it("reports nothing for an absent configuration", () => {
    expect(providerTimeoutsFrom(undefined)).toEqual({});
  });

  it("omits a field the configuration does not set", () => {
    // Absent means "use the built-in", not "use zero" — zero would disable the
    // deadline entirely, which is the opposite of the intent.
    expect(providerTimeoutsFrom({ providerHeadersTimeoutMs: 22 })).toEqual({ headersTimeoutMs: 22 });
  });
});

describe("a request against a provider that never answers", () => {
  it("gives up at the configured deadline instead of waiting forever", async () => {
    const url = await startSilentServer();
    const fetchImpl = createProviderFetchFromEnv({
      env: {},
      timeouts: { headersTimeoutMs: 300 },
    });

    const started = Date.now();
    await expect(fetchImpl(url, { method: "POST", body: "{}" })).rejects.toThrow();
    const elapsed = Date.now() - started;

    // Ended, and ended because of the deadline rather than because the server
    // answered. A generous upper bound keeps this from being flaky on a loaded
    // machine while still failing if the deadline is not applied at all.
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(10_000);
  });

  it("still reads a response that arrives", async () => {
    // The deadline must not break the ordinary case.
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;

    const fetchImpl = createProviderFetchFromEnv({ env: {}, timeouts: { headersTimeoutMs: 5_000 } });
    const response = await fetchImpl(`http://127.0.0.1:${address.port}/v1/models`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("providerFetchFromTimeouts", () => {
  it("reuses the wrapper for the same deadlines", () => {
    // The wrapper holds a dispatcher; rebuilding it per prompt would accumulate
    // connections nobody closes.
    const first = providerFetchFromTimeouts({ headersTimeoutMs: 4_242 });
    const second = providerFetchFromTimeouts({ headersTimeoutMs: 4_242 });
    expect(second).toBe(first);
  });

  it("builds a new wrapper when a deadline changes", () => {
    // A reload that changes a timeout must not silently keep the old one.
    const before = providerFetchFromTimeouts({ headersTimeoutMs: 4_243 });
    const after = providerFetchFromTimeouts({ headersTimeoutMs: 4_244 });
    expect(after).not.toBe(before);
  });
});
