import { describe, expect, it } from "vitest";

import { createModelResponseBoundary } from "../provider/response/boundary.js";
import { accumulateAssistantResponse } from "../turn/assistantResponse.js";
import { extractToolCallBatch } from "./toolCallBatch.js";

describe("tool call batch extraction", () => {
  it("handles no tool calls as an empty not-dispatched batch", () => {
    const batch = extractToolCallBatch(makeInput([]));

    expect(batch.extractionStatus).toBe("empty");
    expect(batch.calls).toHaveLength(0);
    expect(batch.dispatchStatus).toBe("not_dispatched");
    expect(batch.notProvenClaims).toContain("tool-dispatch-not-run");
    expect(batch.terminalSuccessClaim).toBe(false);
  });

  it("normalizes one and multiple tool calls without dispatching", () => {
    const single = extractToolCallBatch(makeInput([
      { id: "call-1", name: "read", arguments: { path: "a.ts" } },
    ]));
    const multi = extractToolCallBatch(makeInput([
      { id: "call-1", name: "read", arguments: { path: "a.ts" } },
      { id: "call-2", name: "git-status", arguments: { short: true } },
    ]));

    expect(single.extractionStatus).toBe("extracted");
    expect(single.calls[0]).toMatchObject({
      id: "call-1",
      name: "read",
      kind: "allowlisted",
      status: "prepared",
      dispatchStatus: "not_dispatched",
      argumentKeys: ["path"],
    });
    expect(multi.calls.map((call) => call.name)).toEqual(["read", "git-status"]);
    expect(multi.calls.every((call) => call.dispatchStatus === "not_dispatched"))
      .toBe(true);
  });

  it("classifies malformed, duplicate, unsupported, and unknown tool calls", () => {
    const batch = extractToolCallBatch(makeInput([
      { id: "call-1", name: "read", arguments: { path: "a.ts" } },
      { id: "call-1", name: "read" },
      { id: "call-unsupported", name: "mcp__missing__tool" },
      { id: "call-missing-name" },
      "not an object",
    ]));

    expect(batch.extractionStatus).toBe("partial");
    expect(batch.malformedCallCount).toBe(3);
    expect(batch.unsupportedCallCount).toBe(1);
    expect(batch.calls.map((call) => call.status)).toEqual([
      "prepared",
      "malformed",
      "unsupported",
      "malformed",
      "malformed",
    ]);
    expect(batch.notProvenClaims).toEqual(
      expect.arrayContaining([
        "tool-call-duplicate-id",
        "tool-call-unsupported",
        "tool-call-name-missing",
      ]),
    );
  });

  it("redacts argument summaries and never stores raw unsafe argument values", () => {
    const batch = extractToolCallBatch(makeInput([
      {
        id: "call-redact",
        name: "write",
        arguments: {
          path: "/home/wang/.private-agents-real/provider.env",
          oldText: "before",
          newText: "after",
          token: "secret",
        },
      },
    ]));
    const serialized = JSON.stringify(batch);

    expect(batch.redaction.status).toBe("redacted");
    expect(batch.calls[0]?.argumentSummary).toContain("redacted=true");
    expect(serialized).not.toMatch(
      /cheers-real|provider\.env|oldText=before|newText=after|token=secret/i,
    );
    expect(batch.calls[0]?.terminalSuccessClaim).toBe(false);
  });
});

function makeInput(candidates: readonly unknown[]) {
  const responseBoundary = createModelResponseBoundary({
    responseId: "response-tools",
    turnId: "turn-1",
    source: "fake_default_safe",
    toolCallCount: candidates.length,
  });
  const assistantResponse = accumulateAssistantResponse({
    responseBoundary,
    chunks: [{ toolCalls: candidates }],
  });
  return { responseBoundary, assistantResponse };
}
