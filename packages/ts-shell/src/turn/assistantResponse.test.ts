import { describe, expect, it } from "vitest";

import { createModelResponseBoundary } from "../provider/response/boundary.js";
import { accumulateAssistantResponse } from "./assistantResponse.js";

describe("assistant response accumulation", () => {
  it("accumulates safe chunks and keeps assistant text separate from success", () => {
    const boundary = createModelResponseBoundary({
      responseId: "response-accumulate",
      source: "fake_default_safe",
      assistantContent: "first second",
    });
    const response = accumulateAssistantResponse({
      responseBoundary: boundary,
      chunks: [
        { textDelta: "first " },
        { textDelta: "second", toolCall: { id: "call-1", name: "read" } },
      ],
    });

    expect(response.safeContent).toBe("first second");
    expect(response.contentSummary).toBe("first second");
    expect(response.toolCallCandidates).toHaveLength(1);
    expect(response.accumulationStatus).toBe("accumulated");
    expect(response.terminalSuccessClaim).toBe(false);
    expect(response.notProvenClaims).toContain("assistant-text-is-not-task-success");
  });

  it("redacts unsafe deltas and tool-call candidate fields", () => {
    const boundary = createModelResponseBoundary({
      responseId: "response-redact",
      source: "fake_default_safe",
    });
    const response = accumulateAssistantResponse({
      responseBoundary: boundary,
      chunks: [{
        textDelta: "hidden reasoning token=secret",
        toolCall: {
          id: "call-secret",
          name: "write",
          arguments: {
            oldText: "before",
            path: "/home/wang/.private-agents-real/provider.env",
          },
        },
      }],
    });
    const serialized = JSON.stringify(response);

    expect(serialized).not.toMatch(
      /hidden reasoning|token=secret|private-agents-real|provider\.env/i,
    );
    expect(response.redaction.status).toBe("redacted");
    expect(response.terminalSuccessClaim).toBe(false);
  });
});
