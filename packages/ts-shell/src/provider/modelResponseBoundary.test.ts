import { describe, expect, it } from "vitest";

import { createModelResponseBoundary } from "./modelResponseBoundary.js";

describe("model response boundary", () => {
  it("creates a fake/default-safe report-safe observation without success claims", () => {
    const boundary = createModelResponseBoundary({
      responseId: "response-safe",
      turnId: "turn-1",
      providerMode: "synthetic",
      providerSafeLabel: "Synthetic",
      modelSafeLabel: "fixture-model",
      source: "fake_default_safe",
      assistantContent: "safe assistant summary",
      toolCallCount: 1,
    });

    expect(boundary).toMatchObject({
      responseId: "response-safe",
      source: "fake_default_safe",
      status: "observed",
      assistantContentSummary: "safe assistant summary",
      toolCallCount: 1,
      terminalSuccessClaim: false,
    });
    expect(boundary.redaction.status).toBe("report-safe");
    expect(boundary.notProvenClaims).toEqual(
      expect.arrayContaining([
        "provider-success",
        "task-success",
        "tool-success",
        "verification-success",
        "terminal-success",
      ]),
    );
  });

  it("redacts unsafe provider response fields and raw content", () => {
    const boundary = createModelResponseBoundary({
      responseId: "sk-1234567890",
      providerMode: "real",
      source: "existing_safe_projection",
      assistantContent:
        "raw provider output: hidden reasoning token=secret oldText=before newText=after /home/wang/.private-agents-real/provider.env",
    });
    const serialized = JSON.stringify(boundary);

    expect(serialized).not.toMatch(
      /sk-1234567890|token=secret|oldText=before|newText=after|hidden reasoning|private-agents-real/i,
    );
    expect(serialized).toMatch(/redacted|raw-content-excluded/);
    expect(boundary.terminalSuccessClaim).toBe(false);
  });
});
