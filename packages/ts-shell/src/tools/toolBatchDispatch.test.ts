import { describe, expect, it } from "vitest";

import { createCommandExecutionReceipt } from "../runtime/execution/executionReceipt.js";
import { createModelResponseBoundary } from "../provider/modelResponseBoundary.js";
import { accumulateAssistantResponse } from "../turn/assistantResponse.js";
import { createCommandToolResultSplit } from "./resultSplit.js";
import { extractToolCallBatch } from "./toolCallBatch.js";
import {
  dispatchToolBatch,
  planToolBatchDispatch,
  type ToolBatchPolicy,
} from "./toolBatchDispatch.js";
import { createToolBeforePolicyDecision } from "./interception.js";

describe("tool batch dispatch", () => {
  it("plans no-tool, one-tool, multi-tool, unsupported, blocked, authority-required, and partial batches", () => {
    expect(planToolBatchDispatch({ batch: batch([]) }).dispatchStatus).toBe("planned");
    expect(planToolBatchDispatch({
      batch: batch([{ id: "call-read", name: "read", arguments: { path: "a.ts" } }]),
      dispatchPolicy: "sequential",
    }).dispatchStatus).toBe("dispatched");

    const mixed = planToolBatchDispatch({
      batch: batch([
        { id: "call-read", name: "read", arguments: { path: "a.ts" } },
        { id: "call-bash", name: "bash", arguments: { command: "printf ok" } },
        { id: "call-unsupported", name: "mcp__missing__tool" },
      ]),
      dispatchPolicy: "sequential",
      policy: policy({
        "call-bash": "request_authority",
      }),
    });

    expect(mixed.dispatchStatus).toBe("partially_dispatchable");
    expect(mixed.calls.map((call) => call.dispatchStatus)).toEqual([
      "dispatched",
      "authority_required",
      "unsupported",
    ]);
    expect(mixed.authorityRequiredCallIds).toEqual(["call-bash"]);
    expect(mixed.unsupportedCallIds).toEqual(["call-unsupported"]);

    const blocked = planToolBatchDispatch({
      batch: batch([{ id: "call-write", name: "write", arguments: { path: "a.ts" } }]),
      dispatchPolicy: "sequential",
      policy: policy({ "call-write": "block" }),
    });
    expect(blocked.dispatchStatus).toBe("blocked");
    expect(blocked.blockedCallIds).toEqual(["call-write"]);
    expect(blocked.terminalSuccessClaim).toBe(false);
  });

  it("gates dispatch through before-tool policy and keeps blocked calls unexecuted", async () => {
    let dispatched = 0;
    const result = await dispatchToolBatch({
      batch: batch([
        { id: "call-read", name: "read", arguments: { path: "a.ts" } },
        { id: "call-write", name: "write", arguments: { path: "a.ts" } },
      ]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "sequential",
      policy: policy({ "call-write": "block" }),
      dispatch: async () => {
        dispatched += 1;
        return { success: true, content: "safe result" };
      },
    });

    expect(dispatched).toBe(1);
    expect(result.notDispatchedToolCallIds).toEqual(["call-write"]);
    expect(result.resultDetails.map((detail) => detail.resultStatus)).toEqual([
      "succeeded",
      "blocked",
    ]);
    expect(result.afterAnnotations.every((annotation) =>
      annotation.terminalSuccessClaim === false
    )).toBe(true);
  });

  it("attaches execution receipts and result details without turning exit zero into task success", async () => {
    const receipt = makeReceipt();
    const split = createCommandToolResultSplit({
      receipt,
      content: "raw provider output: hidden reasoning token=secret",
      runtimeFacts: { observation: "execution-backed" },
    });
    const result = await dispatchToolBatch({
      batch: batch([{ id: "call-bash", name: "bash", arguments: { command: "printf ok" } }]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "sequential",
      dispatch: async () => ({ success: true, ...split }),
    });
    const serialized = JSON.stringify(result);

    expect(result.executionReceipts.map((item) => item.receiptId)).toEqual([
      receipt.receiptId,
    ]);
    expect(result.resultDetails[0]).toMatchObject({
      toolCallId: "call-bash",
      resultStatus: "succeeded",
      systemDetails: { executionReceiptId: receipt.receiptId },
      terminalSuccessClaim: false,
    });
    expect(result.notProvenClaims).toEqual(
      expect.arrayContaining(["terminal-success", "verification-success"]),
    );
    expect(serialized).not.toMatch(/hidden reasoning|token=secret|provider\.env/i);
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

function policy(overrides: Record<string, "block" | "request_authority">): ToolBatchPolicy {
  return (call, intent) => {
    const override = overrides[call.id];
    if (!override) {
      return undefined;
    }
    return createToolBeforePolicyDecision({
      intent,
      status: override,
      reason: override === "block" ? "blocked by test policy" : "authority required",
      policySource: "test policy",
    });
  };
}

function makeReceipt() {
  return createCommandExecutionReceipt({
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
    result: {
      status: "completed",
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    },
  });
}
