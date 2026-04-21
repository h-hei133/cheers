import { describe, expect, it } from "vitest";
import {
  checkRealProviderReadiness,
  createProviderReadinessTerminalEvent,
} from "./providerReadiness.js";

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
    const result = await checkRealProviderReadiness({
      apiKey: "test-key",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });

    expect(result.ok).toBe(false);
    if ("failure" in result) {
      expect(result.failure.kind).toBe("network");
      expect(result.failure.stopReason).toContain("provider-readiness:network");
      return;
    }

    throw new Error("Expected readiness failure for network issue");
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
});
