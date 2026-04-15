import { describe, expect, it } from "vitest";
import {
  checkRealProviderReadiness,
  createProviderReadinessTerminalEvent,
} from "./providerReadiness.js";

describe("provider readiness boundary", () => {
  it("classifies missing key into actionable readiness failure", async () => {
    const result = await checkRealProviderReadiness({ apiKey: "" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected readiness failure for missing API key");
    }

    expect(result.failure.kind).toBe("missing-key");
    expect(result.failure.stopReason).toContain(
      "provider-readiness:missing-key",
    );
    expect(result.failure.stopReason).toContain("OPENAI_API_KEY");
  });

  it("classifies auth rejection (401/403) into actionable readiness failure", async () => {
    const result = await checkRealProviderReadiness({
      apiKey: "test-key",
      fetchImpl: async () => new Response("unauthorized", { status: 401 }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected readiness failure for auth rejection");
    }

    expect(result.failure.kind).toBe("auth");
    expect(result.failure.stopReason).toContain("provider-readiness:auth");
  });

  it("classifies network/unreachable into actionable readiness failure", async () => {
    const result = await checkRealProviderReadiness({
      apiKey: "test-key",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected readiness failure for network issue");
    }

    expect(result.failure.kind).toBe("network");
    expect(result.failure.stopReason).toContain("provider-readiness:network");
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
});
