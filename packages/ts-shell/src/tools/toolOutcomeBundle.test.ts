import { describe, expect, it } from "vitest";

import { createCommandExecutionReceipt } from "../runtime/execution/receipt.js";
import { createModelResponseBoundary } from "../provider/response/boundary.js";
import { accumulateAssistantResponse } from "../turn/assistantResponse.js";
import { prepareToolResultMessages } from "../turn/toolResultMessage.js";
import { extractToolCallBatch } from "./toolCallBatch.js";
import { createToolOutcomeBundle } from "./toolOutcomeBundle.js";
import { dispatchToolBatch, type ToolBatchPolicy } from "./toolBatchDispatch.js";
import { createToolBeforePolicyDecision } from "./policy/interception.js";

describe("tool outcome bundle", () => {
  it("preserves executed and non-executed states without success inflation", async () => {
    const receipt = createCommandExecutionReceipt({
      request: {
        operationKind: "command.run",
        command: "sh",
        args: ["-c", "printf ok"],
        cwd: "/workspace",
        workspaceRoot: "/workspace",
        authority: {
          mode: "command-allowlisted",
          source: "tool-runtime-approval",
          reason: "test authority",
        },
        caller: "core-tool:bash",
        reason: "test receipt",
        reportSafeCommand: "printf ok",
      },
      result: { status: "completed", exitCode: 0, stdout: "ok", stderr: "" },
    });
    const dispatchResult = await dispatchToolBatch({
      batch: batch([
        { id: "call-read", name: "read", arguments: { path: "a.ts" } },
        { id: "call-blocked", name: "write", arguments: { path: "a.ts" } },
        { id: "call-bad", name: "mcp__missing__tool", arguments: {} },
      ]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "sequential",
      policy: policy({ "call-blocked": "block" }),
      dispatch: async () => ({
        success: true,
        content: "safe result",
        details: { executionReceipt: receipt },
      }),
    });
    const resultMessages = prepareToolResultMessages({
      dispatchPlan: dispatchResult.dispatchPlan,
      resultDetails: dispatchResult.resultDetails,
    });
    const bundle = createToolOutcomeBundle({
      dispatchResult,
      resultMessages,
      sourceModelBoundaryId: "response-a",
    });

    expect(bundle).toMatchObject({
      executedCount: 1,
      blockedCount: 1,
      unsupportedCount: 1,
      mixedOutcomeStatus: "mixed_success_and_non_success",
      nextAction: "surface_blocked_result",
      nextActionReason: "blocked or unsupported tool results must stay visible before continuing",
      terminalSuccessClaim: false,
    });
    expect(bundle.receiptIds).toEqual([receipt.receiptId]);
    expect(bundle.resultMessageIds).toEqual([
      "tool-result-message:call-bad",
      "tool-result-message:call-blocked",
      "tool-result-message:call-read",
    ]);
    expect(bundle.blockingFacts).toEqual(
      expect.arrayContaining([
        "call-blocked:blocked_by_policy",
        "call-bad:unsupported_tool",
      ]),
    );
    expect(bundle.carryForwardFacts).toMatchObject({
      status: "mixed_success_and_non_success",
      nextAction: "surface_blocked_result",
      terminalSuccessClaim: false,
    });
    expect(bundle.carryForwardFacts.blockedReasons).toEqual(
      expect.arrayContaining([
        "call-blocked:blocked_by_policy",
        "call-bad:unsupported_tool",
      ]),
    );
    expect(bundle.notProvenClaims).toEqual(
      expect.arrayContaining([
        "task-success",
        "verification-success",
        "next-turn-success",
        "tool-outcome-next-action-is-not-task-success",
      ]),
    );
  });

  it("keeps failed tool carry-forward as review-only and non-terminal", async () => {
    const dispatchResult = await dispatchToolBatch({
      batch: batch([{ id: "call-read", name: "read", arguments: { path: "a.ts" } }]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "sequential",
      dispatch: async () => ({
        success: false,
        error: "safe failure",
      }),
    });
    const resultMessages = prepareToolResultMessages({
      dispatchPlan: dispatchResult.dispatchPlan,
      resultDetails: dispatchResult.resultDetails,
    });
    const bundle = createToolOutcomeBundle({
      dispatchResult,
      resultMessages,
      sourceModelBoundaryId: "response-failed-tool",
    });

    expect(bundle.nextAction).toBe("review_failed_result");
    expect(bundle.carryForwardFacts).toMatchObject({
      status: "single_non_success",
      nextAction: "review_failed_result",
      terminalSuccessClaim: false,
    });
    expect(bundle.carryForwardFacts.blockedReasons).toEqual([
      "call-read:executed_failed",
    ]);
    expect(bundle.notProvenClaims).toContain("terminal-success");
    expect(JSON.stringify(bundle)).not.toContain('"success":true');
  });

  it("redacts unsafe report fields and keeps claims evidence-only", async () => {
    const dispatchResult = await dispatchToolBatch({
      batch: batch([
        {
          id: "call-redacted",
          name: "bash",
          arguments: { command: "printf token=secret provider.env=/tmp/x" },
        },
      ]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "sequential",
    });
    const resultMessages = prepareToolResultMessages({
      dispatchPlan: dispatchResult.dispatchPlan,
      resultDetails: dispatchResult.resultDetails,
    });
    const bundle = createToolOutcomeBundle({ dispatchResult, resultMessages });
    const serialized = JSON.stringify(bundle);

    expect(bundle.redactionStatus).toBe("redacted");
    expect(bundle.terminalSuccessClaim).toBe(false);
    expect(serialized).not.toMatch(/token=secret|provider\.env=\/tmp\/x|hidden reasoning/i);
  });
});

function batch(candidates: readonly unknown[]) {
  const responseBoundary = createModelResponseBoundary({
    responseId: "response-dispatch",
    turnId: "turn-dispatch",
    source: "fake_default_safe",
    toolCallCount: candidates.length,
  });
  const assistantResponse = accumulateAssistantResponse({
    responseBoundary,
    chunks: [{ toolCalls: candidates }],
  });
  return extractToolCallBatch({ responseBoundary, assistantResponse });
}

function policy(overrides: Record<string, "block">): ToolBatchPolicy {
  return (call, intent) => {
    if (!overrides[call.id]) {
      return undefined;
    }
    return createToolBeforePolicyDecision({
      intent,
      status: "block",
      reason: "blocked by test policy",
      policySource: "test policy",
    });
  };
}
