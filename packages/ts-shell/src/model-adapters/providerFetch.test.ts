import { describe, expect, it } from "vitest";
import {
  createProviderFetchFromEnv,
  resolveProviderTransportConfig,
  resolveTransportDecision,
} from "./providerFetch.js";

describe("provider fetch transport", () => {
  it("uses direct provider transport by default with longer timeouts", () => {
    expect(resolveProviderTransportConfig({})).toEqual({
      proxyUrl: undefined,
      noProxy: [],
      diagnosticsEnabled: false,
      connectTimeoutMs: 30_000,
      headersTimeoutMs: 120_000,
      bodyTimeoutMs: 120_000,
    });
  });

  it("supports explicit provider proxy and no-proxy host matching", async () => {
    const calls: Array<{ url: string; dispatcherName: string }> = [];
    const providerFetch = createProviderFetchFromEnv({
      env: {
        PRIVATE_AGENTS_PROVIDER_PROXY: "http://127.0.0.1:7897",
        PRIVATE_AGENTS_PROVIDER_NO_PROXY: "api.siliconflow.cn",
      },
      fetchImpl: (async (input, init) => {
        calls.push({
          url: String(input),
          dispatcherName:
            init && "dispatcher" in init
              ? (init.dispatcher as { constructor?: { name?: string } })
                  .constructor?.name ?? "missing"
              : "missing",
        });
        return new Response("ok", { status: 200 });
      }) as typeof fetch,
    });

    await providerFetch("https://api.siliconflow.cn/v1/chat/completions");
    await providerFetch("https://example.com/v1/chat/completions");

    expect(calls).toEqual([
      {
        url: "https://api.siliconflow.cn/v1/chat/completions",
        dispatcherName: "Agent",
      },
      {
        url: "https://example.com/v1/chat/completions",
        dispatcherName: "ProxyAgent",
      },
    ]);
  });

  it("can resolve proxy from standard env only when explicitly requested", () => {
    expect(
      resolveProviderTransportConfig({
        HTTPS_PROXY: "http://127.0.0.1:7897",
      }).proxyUrl,
    ).toBeUndefined();

    expect(
      resolveProviderTransportConfig({
        PRIVATE_AGENTS_PROVIDER_PROXY: "env",
        HTTPS_PROXY: "http://127.0.0.1:7897",
      }).proxyUrl,
    ).toBe("http://127.0.0.1:7897");
  });

  it("reports no-proxy star as direct even when a proxy is configured", () => {
    const config = resolveProviderTransportConfig({
      PRIVATE_AGENTS_PROVIDER_PROXY: "http://127.0.0.1:7897",
      PRIVATE_AGENTS_PROVIDER_NO_PROXY: "*",
      PRIVATE_AGENTS_PROVIDER_TRANSPORT_DIAGNOSTICS: "1",
    });

    expect(config.diagnosticsEnabled).toBe(true);
    expect(resolveTransportDecision("api.siliconflow.cn", config)).toEqual({
      mode: "direct",
      proxyConfigured: true,
      noProxyMatched: true,
    });
  });
});
