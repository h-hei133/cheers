import { describe, expect, it } from "vitest";
import { createProviderReadinessCliTerminalEvent } from "./providerReadinessCliSurface.js";

describe("provider readiness CLI surface", () => {
  it("maps readiness stop reasons into the existing stopped_error terminal surface", () => {
    const event = createProviderReadinessCliTerminalEvent({
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
    expect(event.result.transcript).toEqual([]);
    expect(event.result.finalOutput).toBe("");
    expect(event.result.sharedContext).toEqual({
      sessionId: "sess_provider_gate",
      initialPrompt: "run real task",
      notes: ["provider-readiness: pre-query gate blocked real provider entry"],
      handoffs: [],
    });
  });

  it("preserves already-redacted provider diagnostics without rewriting markers", () => {
    const redactedStopReason =
      "Provider readiness failed (provider-readiness:unknown): [REAL_PROVIDER_CONFIG_PATH] Authorization: Bearer [REDACTED] api_key=[REDACTED]. Check provider status/config and retry.";

    const event = createProviderReadinessCliTerminalEvent({
      sessionId: "sess_redacted",
      prompt: "run real task",
      stopReason: redactedStopReason,
    });

    expect(event.type).toBe("query.completed");
    if (event.type !== "query.completed") {
      throw new Error("Expected query.completed terminal event");
    }

    expect(event.result.stopReason).toBe(redactedStopReason);
    expect(event.result.stopReason).toContain("[REAL_PROVIDER_CONFIG_PATH]");
    expect(event.result.stopReason).toContain("Bearer [REDACTED]");
    expect(event.result.stopReason).toContain("api_key=[REDACTED]");
  });
});
