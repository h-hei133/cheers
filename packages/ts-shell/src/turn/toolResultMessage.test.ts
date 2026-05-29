import { describe, expect, it } from "vitest";

import { createModelResponseBoundary } from "../provider/modelResponseBoundary.js";
import { accumulateAssistantResponse } from "./assistantResponse.js";
import { prepareToolResultMessages } from "./toolResultMessage.js";
import { extractToolCallBatch } from "../tools/toolCallBatch.js";
import { dispatchToolBatch } from "../tools/toolBatchDispatch.js";
import { createToolBeforePolicyDecision } from "../tools/interception.js";

describe("tool result messages", () => {
  it("prepares report-safe future next-turn messages without delivering a next turn", async () => {
    const dispatch = await dispatchToolBatch({
      batch: batch([
        { id: "call-read", name: "read", arguments: { path: "a.ts" } },
        { id: "call-write", name: "write", arguments: { path: "a.ts" } },
        { id: "call-unsupported", name: "external.tool" },
      ]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "sequential",
      policy: (call, intent) => call.id === "call-write"
        ? createToolBeforePolicyDecision({
            intent,
            status: "block",
            reason: "write blocked",
            policySource: "test policy",
          })
        : undefined,
      dispatch: async () => ({
        success: true,
        content:
          "safe summary token=secret oldText=before newText=after /home/wang/.private-agents-real/provider.env",
      }),
    });

    const messages = prepareToolResultMessages({
      dispatchPlan: dispatch.dispatchPlan,
      resultDetails: dispatch.resultDetails,
    });
    const serialized = JSON.stringify(messages);

    expect(messages.messages.map((message) => message.deliveryStatus)).toEqual([
      "prepared",
      "blocked",
      "unsupported",
    ]);
    expect(messages.preparedCount).toBe(1);
    expect(messages.terminalSuccessClaim).toBe(false);
    expect(messages.notProvenClaims).toContain("next-turn-success");
    expect(serialized).not.toMatch(
      /token=secret|oldText=before|newText=after|private-agents-real|provider\.env/i,
    );
  });
});

function batch(candidates: readonly unknown[]) {
  const responseBoundary = createModelResponseBoundary({
    responseId: "response-message",
    turnId: "turn-message",
    source: "fake_default_safe",
    toolCallCount: candidates.length,
  });
  const assistantResponse = accumulateAssistantResponse({
    responseBoundary,
    chunks: [{ toolCalls: candidates }],
  });
  return extractToolCallBatch({ responseBoundary, assistantResponse });
}
