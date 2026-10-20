import { describe, expect, it, vi } from "vitest";
import {
  checkRealProviderReadiness,
  createProviderReadinessTerminalEvent,
} from "./providerReadiness.js";
import { redactProviderFailureDetail } from "./providerFailureRedaction.js";
import { DEFAULT_ENDPOINT_KIND } from "../../provider/endpoints/index.js";

describe("provider readiness boundary", () => {
  it("sends Copilot gateway identity on the models probe", async () => {
    const result = await checkRealProviderReadiness({
      provider: "github-copilot",
      accountAuth: { type: "subscription", provider: "github-copilot", baseUrl: "https://api.individual.githubcopilot.com",
        accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: Date.now() + 3_600_000 },
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe("https://api.individual.githubcopilot.com/models");
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer synthetic-access");
        expect(headers.get("accept")).toBe("application/json");
        expect(headers.get("editor-version")).toBe("vscode/1.107.0");
        expect(headers.get("editor-plugin-version")).toBe("copilot-chat/0.35.0");
        expect(headers.get("copilot-integration-id")).toBe("vscode-chat");
        expect(headers.get("user-agent")).toBe("GitHubCopilotChat/0.35.0");
        return new Response("{}");
      },
    });
    expect(result).toEqual({ ok: true });
  });

  it("does not tell a Copilot policy denial to replace a valid login with an API key", async () => {
    const result = await checkRealProviderReadiness({
      provider: "github-copilot",
      accountAuth: { type: "subscription", provider: "github-copilot", baseUrl: "https://api.individual.githubcopilot.com",
        accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: Date.now() + 3_600_000 },
      fetchImpl: async () => new Response("forbidden", { status: 403 }),
    });
    expect(result).toMatchObject({ ok: false, failure: { kind: "auth" } });
    if ("failure" in result) {
      expect(result.failure.stopReason).toContain("plan");
      expect(result.failure.stopReason).not.toContain("GITHUB_COPILOT_API_KEY");
    }
  });

  it.each([{ scopes: undefined }, { quotaProject: undefined }])('reports unverified Google metadata %j before any HTTP', async patch => {
    const fetchImpl = vi.fn();
    const result = await checkRealProviderReadiness({ provider: 'google', model: 'gemini-fixture',
      accountAuth: { type: 'google-gemini-account', accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
        expiresAt: Date.now() + 3600_000, clientId: 'synthetic-client', scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        quotaProject: 'synthetic-project', ...patch }, fetchImpl });
    expect(result).toMatchObject({ ok: false, failure: { kind: 'missing-config' } }); expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the native account issuer, bearer and captured project despite an ambient API key', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'synthetic-outside-key');
    try {
      const urls: string[] = [];
      const result = await checkRealProviderReadiness({ provider: 'google', model: 'gemini-fixture',
        accountAuth: { type: 'google-gemini-account', accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh',
          expiresAt: Date.now() + 3600_000, clientId: 'synthetic-client', scopes: ['https://www.googleapis.com/auth/cloud-platform'], quotaProject: 'synthetic-project' },
        fetchImpl: async (input, init) => {
          urls.push(String(input)); const headers = new Headers(init?.headers);
          expect(headers.get('authorization')).toBe('Bearer synthetic-access');
          expect(headers.get('x-goog-user-project')).toBe('synthetic-project'); expect(headers.has('x-goog-api-key')).toBe(false);
          expect(init?.redirect).toBe('error'); return new Response('{}');
        } });
      expect(result).toEqual({ ok: true }); expect(urls).toEqual(['https://generativelanguage.googleapis.com/v1beta/models']);
    } finally { vi.unstubAllEnvs(); }
  });

  it.each([
    { provider: "anthropic" as const, url: "https://api.anthropic.com/v1/models", header: "x-api-key" },
    { provider: "google-ai" as const, url: "https://generativelanguage.googleapis.com/v1beta/models", header: "x-goog-api-key" },
  ])("uses the protocol resource and authentication for $provider", async ({ provider, url, header }) => {
    const calls: string[] = [];
    let cancelled = false;
    const result = await checkRealProviderReadiness({
      provider, apiKey: "test-key",
      fetchImpl: async (input, init) => {
        calls.push(String(input));
        const headers = new Headers(init?.headers);
        expect(headers.get(header)).toBe("test-key");
        expect(headers.has("authorization")).toBe(false);
        if (provider === "anthropic") expect(headers.get("anthropic-version")).toBe("2023-06-01");
        return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
      },
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([url]);
    expect(cancelled).toBe(true);
  });

  it("uses the selected catalog protocol instead of inferring it from a provider label", async () => {
    const result = await checkRealProviderReadiness({
      provider: "anthropic", endpoint: DEFAULT_ENDPOINT_KIND, apiKey: "test-key", baseUrl: "https://gateway.invalid/v1",
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe("https://gateway.invalid/v1/models");
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer test-key");
        expect(headers.has("x-api-key")).toBe(false);
        return new Response("ok");
      },
    });
    expect(result).toEqual({ ok: true });
  });

  it.each(["bedrock", "vertex"] as const)("leaves signed %s generation validation to its request transport", async provider => {
    expect(await checkRealProviderReadiness({
      provider, apiKey: "", baseUrl: "https://generation.invalid/account/models", model: "model",
      fetchImpl: async () => { throw new Error("No model-list resource at this generation host"); },
    })).toEqual({ ok: true });
  });

  it("refuses a foreign account protocol without a readiness probe", async () => {
    let calls = 0;
    const result = await checkRealProviderReadiness({
      provider: "openai", endpoint: "anthropic-messages", apiKey: "", baseUrl: "https://gateway.invalid/v1",
      accountAuth: { type: "openai-chatgpt-account", accessToken: "account-token", refreshToken: "refresh", expiresAt: Date.now() + 60_000 },
      fetchImpl: async (input, init) => {
        calls++;
        expect(String(input)).toBe("https://gateway.invalid/v1/models");
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe("Bearer account-token");
        expect(headers.get("anthropic-version")).toBe("2023-06-01");
        expect(headers.has("x-api-key")).toBe(false);
        return new Response("ok");
      },
    });
    expect(result).toMatchObject({ ok: false, failure: { kind: 'missing-config' } });
    expect(calls).toBe(0);
  });

  it.each([200, 401, 403])("preserves HTTP %s when releasing an errored response body fails", async status => {
    let calls = 0;
    const result = await checkRealProviderReadiness({
      apiKey: "test-key",
      fetchImpl: async () => {
        calls++;
        return new Response(new ReadableStream({ start(controller) { controller.error(new Error("network body reset")); } }), { status });
      },
    });
    if (status === 200) expect(result).toEqual({ ok: true });
    else expect(result).toMatchObject({ ok: false, failure: { kind: "auth" } });
    expect(calls).toBe(1);
  });

  it("does not send a scoped credential to a fallback host when its endpoint is absent", async () => {
    const result = await checkRealProviderReadiness({
      provider: "vertex", apiKey: "",
      fetchImpl: async () => { throw new Error("No configured account host"); },
    });
    expect(result).toMatchObject({ ok: false, failure: { kind: "missing-config" } });
  });

  it("does not retry an explicit cancellation during a readiness request", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled by user");
    let calls = 0;
    const pending = checkRealProviderReadiness({
      provider: "anthropic", apiKey: "test-key", signal: controller.signal,
      fetchImpl: async (_input, init) => {
        calls++;
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
          controller.abort(reason);
        });
      },
    });
    await expect(pending).rejects.toBe(reason);
    expect(calls).toBe(1);
    await expect(checkRealProviderReadiness({ apiKey: "test-key", signal: controller.signal })).rejects.toBe(reason);
  });

  it("classifies missing key into actionable readiness failure", async () => {
    const result = await checkRealProviderReadiness({
      provider: "openai",
      apiKey: "",
    });

    expect(result.ok).toBe(false);
    if ("failure" in result) {
      expect(result.failure.kind).toBe("missing-key");
      expect(result.failure.stopReason).toContain(
        "provider-readiness:missing-key",
      );
      expect(result.failure.stopReason).toContain("OPENAI_API_KEY");
      expect(result.failure.stopReason).toContain("/connect login openai --account");
      return;
    }

    throw new Error("Expected readiness failure for missing API key");
  });

  it("admits the endpoint that speaks a second protocol", async () => {
    // It used to be refused outright while the catalogue shipped three of its
    // models, so a provider the user could select could never run. What is
    // asserted now is that readiness lets it through and reaches its own host:
    // the point of the endpoint is that it is no longer blocked, not that the
    // block moved somewhere else.
    const calls: string[] = [];
    const result = await checkRealProviderReadiness({
      provider: "anthropic",
      apiKey: "test-key",
      model: "claude-sonnet-4-5",
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    // Its own host, not the default one: a single shared fallback would send
    // one endpoint's probe to the other's address.
    expect(calls[0]).toContain("api.anthropic.com");
  });

  it("requires base URL and model for openai-compatible providers", async () => {
    const missingBaseUrl = await checkRealProviderReadiness({
      provider: "openai-compatible",
      apiKey: "test-key",
      model: "deepseek-ai/DeepSeek-V3",
    });

    expect(missingBaseUrl.ok).toBe(false);
    if ("failure" in missingBaseUrl) {
      expect(missingBaseUrl.failure.kind).toBe("missing-config");
      expect(missingBaseUrl.failure.stopReason).toContain(
        "openai-compatible requires a configured base URL",
      );
    }

    const missingModel = await checkRealProviderReadiness({
      provider: "openai-compatible",
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
    });

    expect(missingModel.ok).toBe(false);
    if ("failure" in missingModel) {
      expect(missingModel.failure.kind).toBe("missing-config");
      expect(missingModel.failure.stopReason).toContain(
        "openai-compatible requires a configured model",
      );
    }
  });

  it("classifies auth rejection (401/403) into actionable readiness failure", async () => {
    const result = await checkRealProviderReadiness({
      apiKey: "test-key",
      fetchImpl: async () => new Response("unauthorized", { status: 401 }),
    });

    expect(result.ok).toBe(false);
    if ("failure" in result) {
      expect(result.failure.kind).toBe("auth");
      expect(result.failure.stopReason).toContain("provider-readiness:auth");
      return;
    }

    throw new Error("Expected readiness failure for auth rejection");
  });

  it("classifies network/unreachable into actionable readiness failure", async () => {
    const requests: string[] = [];
    const result = await checkRealProviderReadiness({
      apiKey: "test-key",
      fetchImpl: async (input) => {
        requests.push(String(input));
        throw new TypeError("fetch failed");
      },
    });

    expect(requests).toHaveLength(5);
    expect(result.ok).toBe(false);
    if ("failure" in result) {
      expect(result.failure.kind).toBe("network");
      expect(result.failure.stopReason).toContain("provider-readiness:network");
      expect(result.failure.stopReason).toContain("reconnecting 1/5");
      expect(result.failure.stopReason).toContain("reconnecting 5/5");
      return;
    }

    throw new Error("Expected readiness failure for network issue");
  });

  it("retries only transient network readiness failures", async () => {
    const requests: string[] = [];
    const result = await checkRealProviderReadiness({
      apiKey: "test-key",
      fetchImpl: async (input) => {
        requests.push(String(input));
        if (requests.length < 3) {
          throw new TypeError("network timeout");
        }
        return new Response("ok", { status: 200 });
      },
    });

    expect(result).toEqual({ ok: true });
    expect(requests).toHaveLength(3);
  });

  it("does not reconnect for auth or configuration hard failures", async () => {
    const authRequests: string[] = [];
    const authResult = await checkRealProviderReadiness({
      apiKey: "test-key",
      fetchImpl: async (input) => {
        authRequests.push(String(input));
        return new Response("unauthorized", { status: 401 });
      },
    });

    expect(authResult.ok).toBe(false);
    expect(authRequests).toHaveLength(1);
    if ("failure" in authResult) {
      expect(authResult.failure.kind).toBe("auth");
      expect(authResult.failure.stopReason).not.toContain("reconnecting");
    }

    const missingKeyResult = await checkRealProviderReadiness({
      provider: "openai",
      apiKey: "",
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    });
    expect(missingKeyResult.ok).toBe(false);
    if ("failure" in missingKeyResult) {
      expect(missingKeyResult.failure.kind).toBe("missing-key");
      expect(missingKeyResult.failure.stopReason).not.toContain("reconnecting");
    }

    const missingConfigResult = await checkRealProviderReadiness({
      provider: "openai-compatible",
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1",
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    });
    expect(missingConfigResult.ok).toBe(false);
    if ("failure" in missingConfigResult) {
      expect(missingConfigResult.failure.kind).toBe("missing-config");
      expect(missingConfigResult.failure.stopReason).not.toContain(
        "reconnecting",
      );
    }
  });

  it("maps readiness failure into a unified stopped_error terminal event", () => {
    const event = createProviderReadinessTerminalEvent({
      sessionId: "sess_provider_gate",
      prompt: "run real task",
      stopReason:
        "Provider readiness failed (provider-readiness:auth): OpenAI authentication was rejected (401/403). Verify OPENAI_API_KEY validity and access scope, then retry.",
    });

    expect(event.type).toBe("query.completed");
    if (event.type !== "query.completed") {
      throw new Error("Expected query.completed terminal event");
    }

    expect(event.result.status).toBe("stopped_error");
    expect(event.result.terminalReason).toBe("stopped_error");
    expect(event.result.terminalClassification).toBe("error");
    expect(event.result.stopReason).toContain("provider-readiness:auth");
  });

  it("keeps ready provider path pass-through", async () => {
    const result = await checkRealProviderReadiness({
      apiKey: "test-key",
      fetchImpl: async () => new Response("ok", { status: 200 }),
    });

    expect(result).toEqual({ ok: true });
  });

  it("accepts valid openai account-auth token without API key", async () => {
    const result = await checkRealProviderReadiness({
      provider: "openai",
      accountAuth: {
        type: "openai-chatgpt-account",
        accessToken: "acct-access",
        refreshToken: "acct-refresh",
        expiresAt: Date.now() + 60_000,
      },
      fetchImpl: async (_input, init) => {
        expect(init?.headers).toMatchObject({
          authorization: "Bearer acct-access",
        });
        return new Response("ok", { status: 200 });
      },
    });

    expect(result).toEqual({ ok: true });
  });

  it("allows openai-compatible readiness with custom endpoint", async () => {
    const requests: string[] = [];
    const result = await checkRealProviderReadiness({
      provider: "openai-compatible",
      apiKey: "test-key",
      baseUrl: "https://api.siliconflow.cn/v1/",
      model: "deepseek-ai/DeepSeek-V3",
      fetchImpl: async (input, init) => {
        requests.push(String(input));
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
        return new Response("ok", { status: 200 });
      },
    });

    expect(result).toEqual({ ok: true });
    expect(requests[0]).toBe("https://api.siliconflow.cn/v1/models");
  });

  it("redacts provider failure details before surfacing unknown readiness errors", async () => {
    const result = await checkRealProviderReadiness({
      apiKey: "test-key",
      fetchImpl: async () => {
        throw new Error(
          "request failed for D:/Test/home-sf/.cheers/config.json Authorization: Bearer sk-live-secret api_key=sk-query-secret https://example.test/v1/models?api_key=sk-url-secret",
        );
      },
    });

    expect(result.ok).toBe(false);
    if ("failure" in result) {
      expect(result.failure.kind).toBe("unknown");
      expect(result.failure.stopReason).toContain(
        "[REAL_PROVIDER_CONFIG_PATH]",
      );
      expect(result.failure.stopReason).toContain("Bearer [REDACTED]");
      expect(result.failure.stopReason).toContain("api_key=[REDACTED]");
      expect(result.failure.stopReason).toContain("api_key=[REDACTED]");
      expect(result.failure.stopReason).not.toContain("home-sf/.cheers");
      expect(result.failure.stopReason).not.toContain("sk-live-secret");
      expect(result.failure.stopReason).not.toContain("sk-query-secret");
      expect(result.failure.stopReason).not.toContain("sk-url-secret");
      return;
    }

    throw new Error("Expected readiness failure for unknown provider error");
  });

  it("redacts standalone provider secret shapes", () => {
    const redacted = redactProviderFailureDetail(
      [
        "Authorization=Bearer acct-access-token",
        "refresh_token=refresh-secret",
        "accessToken: acct-token",
        "x-api-key='sk-header-secret'",
        "C:\\Test\\home-sf\\.cheers\\config.json",
        "https://example.test/v1?token=token-secret&signature=sig-secret",
      ].join("\n"),
    );

    expect(redacted).toContain("Bearer [REDACTED]");
    expect(redacted).toContain("refresh_token=[REDACTED]");
    expect(redacted).toContain("accessToken: [REDACTED]");
    expect(redacted).toContain("x-api-key='[REDACTED]");
    expect(redacted).toContain("[REAL_PROVIDER_CONFIG_PATH]");
    expect(redacted).toContain("token=[REDACTED]");
    expect(redacted).toContain("signature=[REDACTED]");
    expect(redacted).not.toContain("acct-access-token");
    expect(redacted).not.toContain("refresh-secret");
    expect(redacted).not.toContain("acct-token");
    expect(redacted).not.toContain("sk-header-secret");
    expect(redacted).not.toContain("home-sf\\.cheers");
  });
});
