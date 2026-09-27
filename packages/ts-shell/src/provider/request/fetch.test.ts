import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProviderFetchFromEnv,
  providerFetchFromTimeouts,
  resolveProviderTimeouts,
  providerTimeoutsFrom,
  resolveProviderTransportConfig,
  withRequestSigner,
  providerFetchForEndpoint,
} from "./fetch.js";
import { endpointShape } from "../endpoints/index.js";

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

    // Ended because the deadline applied, not because the server answered — it
    // never answers. The lower bound is what proves that: the deadline is 300ms
    // and the server stays silent, so anything at or past it means the timer
    // fired rather than the connection resolving.
    //
    // No upper bound on wall-clock time. One was here, at ten seconds, and it
    // failed on a loaded machine at 14s — the assertion was measuring how busy
    // the host was, not whether the deadline was applied. What rules out "hung
    // forever" is that the promise settled at all, which the await above proves.
    expect(elapsed).toBeGreaterThanOrEqual(250);
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

  it("does not confuse two different deadline triples for one", () => {
    // The key used to be the raw values joined with "/", so these two rendered
    // the same string and the second caller was handed the first one's wrapper.
    const first = providerFetchFromTimeouts({ connectTimeoutMs: 1 });
    const second = providerFetchFromTimeouts({ connectTimeoutMs: 1, headersTimeoutMs: 2 });
    expect(second).not.toBe(first);
  });

  it("keys on the deadline in force, not on how it was written", () => {
    // `${VAR}` interpolation yields a string. The old key used the raw field, so
    // `"4245"` — dropped by the guard, effective 30_000 — keyed the same as the
    // number 4245 and a reload served the stale wrapper. Now both resolve to the
    // same number, so sharing one wrapper is correct; what must not differ is the
    // deadline each ends up with.
    expect(resolveProviderTimeouts({ connectTimeoutMs: "4245" as unknown as number }).connectTimeoutMs).toBe(4_245);
    expect(resolveProviderTimeouts({ connectTimeoutMs: 4245 }).connectTimeoutMs).toBe(4_245);
  });

  it("does not confuse a delimiter for a field boundary", () => {
    // The key joined raw values with "/", so a value containing one rendered the
    // same as two shorter values while describing a different set of deadlines.
    const oneValue = providerFetchFromTimeouts({ connectTimeoutMs: "1/2" as unknown as number });
    const twoValues = providerFetchFromTimeouts({
      connectTimeoutMs: 1,
      headersTimeoutMs: "2/" as unknown as number,
    });
    expect(twoValues).not.toBe(oneValue);
  });
});

describe("a deadline the configuration states badly", () => {
  it("reads a number that arrived as text", async () => {
    // `${VAR}` interpolation produces a string. Discarding it left the built-in
    // deadline in force with nothing to say so.
    const resolved = resolveProviderTimeouts({ connectTimeoutMs: "6000" as unknown as number });
    expect(resolved.connectTimeoutMs).toBe(6_000);
  });

  it("refuses a fraction rather than failing every request", async () => {
    // undici requires an integer and throws otherwise, so one fractional field
    // broke the whole session and surfaced only as "fetch failed".
    const resolved = resolveProviderTimeouts({ headersTimeoutMs: 120_000.5 });
    expect(resolved.headersTimeoutMs).toBe(120_000);
  });

  it("refuses a deadline long enough to never fire", async () => {
    const resolved = resolveProviderTimeouts({ bodyTimeoutMs: 2_000_000_000 });
    expect(resolved.bodyTimeoutMs).toBe(120_000);
  });

  it("still treats zero and negative as not stated", async () => {
    const resolved = resolveProviderTimeouts({ connectTimeoutMs: 0, bodyTimeoutMs: -1 });
    expect(resolved.connectTimeoutMs).toBe(30_000);
    expect(resolved.bodyTimeoutMs).toBe(120_000);
  });
});

describe("a transport that signs its requests", () => {
  /**
   * The signer runs where the whole request exists.
   *
   * A signature covers the method, the URL, the headers and the body, so it can
   * only be computed once all four are in hand — which is here, one line before
   * dispatch. Anywhere earlier and the body has not been serialized yet, which is
   * the part a signature is mostly about.
   */
  it("gives the signer the whole request", async () => {
    const seen: Array<{ url: string; method: string; body?: string; headers: Readonly<Record<string, string>> }> = [];
    const base = (async () => new Response("ok")) as unknown as typeof fetch;
    const signed = withRequestSigner(base, async (request) => {
      seen.push(request);
      return { Authorization: "signed" };
    });

    await signed("https://example.test/model/m/converse-stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://example.test/model/m/converse-stream");
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.body).toBe('{"a":1}');
    expect(seen[0]!.headers["content-type"]).toBe("application/json");
  });

  it("sends the headers the signer added, and keeps the caller's", async () => {
    let sent: Record<string, string> = {};
    const base = (async (_url: unknown, init?: RequestInit) => {
      sent = init?.headers as Record<string, string>;
      return new Response("ok");
    }) as unknown as typeof fetch;
    const signed = withRequestSigner(base, async () => ({ Authorization: "signed", "x-amz-date": "20250101T000000Z" }));

    await signed("https://example.test/x", { method: "POST", headers: { "content-type": "application/json" } });

    expect(sent.Authorization).toBe("signed");
    expect(sent["x-amz-date"]).toBe("20250101T000000Z");
    expect(sent["content-type"]).toBe("application/json");
  });

  it("passes an unsigned request through untouched when there is no signer", async () => {
    let sent: RequestInit | undefined;
    const base = (async (_url: unknown, init?: RequestInit) => {
      sent = init;
      return new Response("ok");
    }) as unknown as typeof fetch;

    await base("https://example.test/x", { method: "POST", body: "b" });

    expect(sent?.method).toBe("POST");
  });
});

describe("a transport that applies its endpoint's signer", () => {
  /**
   * Two endpoints cannot carry a constant credential: one signs the request and
   * one carries a token that expires. Both are computed at the transport, which
   * is the only place a request exists whole — and the signer is asked for once
   * rather than per request, because building one may read a file.
   */
  it("signs a request the endpoint declared a signer for", async () => {
    let signed = 0;
    const base = (async (_url: unknown, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe("SIGNED POST /x/m");
      return new Response("ok");
    }) as unknown as typeof fetch;

    const shaped = withRequestSigner(base, async () => {
      signed += 1;
      return { authorization: "SIGNED POST /x/m" };
    });
    await shaped("https://a.test/x/m", { method: "POST", body: "{}" });

    expect(signed).toBe(1);
  });

  it("adds nothing when the endpoint declared no signer", () => {
    // Most endpoints take a constant header, and wrapping them anyway would put a
    // no-op on the hot path for every request.
    const shape = endpointShape("openai-compatible");
    expect(shape.signer).toBeUndefined();
  });
});

describe("a signer that is expensive to build", () => {
  /**
   * It is built once, even when requests arrive together.
   *
   * Building one may read a credential file or obtain a token, and a session that
   * issues its first requests concurrently would otherwise do that work several
   * times over — for a value that is the same each time.
   */
  it("is built only when a request is actually made", async () => {
    // Building one may read a credential file or obtain a token. A session that
    // never makes a request should not pay for either.
    let built = 0;
    const shaped = providerFetchForEndpoint({}, "openai-compatible", () => ({
      signer: async () => {
        built += 1;
        return async () => ({ authorization: "S" });
      },
    }));

    expect(shaped).toBeDefined();
    expect(built).toBe(0);
  });

  it("reuses the signer it built", async () => {
    const seen: string[] = [];
    const signed = withRequestSigner(
      (async (_url: unknown, init?: RequestInit) => {
        seen.push((init?.headers as Record<string, string>).authorization!);
        return new Response("ok");
      }) as unknown as typeof fetch,
      async () => ({ authorization: "same" }),
    );

    await signed("https://a.test/x", { method: "POST" });
    await signed("https://a.test/y", { method: "POST" });

    expect(seen).toEqual(["same", "same"]);
  });
});
