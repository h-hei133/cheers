import { describe, expect, it } from "vitest";
import {
  checkRealProviderReadiness,
  createProviderReadinessTerminalEvent,
} from "./providerReadiness.js";
import { redactProviderFailureDetail } from "./providerFailureRedaction.js";

describe("provider readiness boundary", () => {
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

  it("blocks unsupported provider before entering query loop", async () => {
    const result = await checkRealProviderReadiness({
      provider: "anthropic",
      apiKey: "test-key",
    });

    expect(result.ok).toBe(false);
    if ("failure" in result) {
      expect(result.failure.kind).toBe("unsupported-provider");
      expect(result.failure.stopReason).toContain(
        "provider-readiness:unsupported-provider",
      );
      expect(result.failure.stopReason).toContain("anthropic");
      return;
    }

    throw new Error("Expected readiness failure for unsupported provider");
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

    const unsupportedResult = await checkRealProviderReadiness({
      provider: "anthropic",
      apiKey: "test-key",
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    });
    expect(unsupportedResult.ok).toBe(false);
    if ("failure" in unsupportedResult) {
      expect(unsupportedResult.failure.kind).toBe("unsupported-provider");
      expect(unsupportedResult.failure.stopReason).not.toContain("reconnecting");
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
        expect(init?.headers).toMatchObject({
          authorization: "Bearer test-key",
        });
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
