import { describe, expect, it } from "vitest";

import { createCommandExecutionReceipt } from "../runtime/execution/receipt.js";
import { createModelResponseBoundary } from "../provider/response/boundary.js";
import { accumulateAssistantResponse } from "../turn/assistantResponse.js";
import { createCommandToolResultSplit } from "./result/split.js";
import { extractToolCallBatch } from "./toolCallBatch.js";
import {
  createToolDispatcherBatchDispatch,
  dispatchToolBatch,
  planToolBatchDispatch,
  type ToolBatchPolicy,
} from "./toolBatchDispatch.js";
import { createToolBeforePolicyDecision } from "./policy/interception.js";

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
      "executed_success",
      "blocked_by_policy",
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
      resultStatus: "executed_success",
      systemDetails: { executionReceiptId: receipt.receiptId },
      terminalSuccessClaim: false,
    });
    expect(result.notProvenClaims).toEqual(
      expect.arrayContaining(["terminal-success", "verification-success"]),
    );
    expect(serialized).not.toMatch(/hidden reasoning|token=secret|provider\.env/i);
  });

  it("bridges eligible report-safe calls through a sanctioned dispatcher seam", async () => {
    const dispatched: Array<{ name: string; args: Record<string, unknown> }> = [];
    const result = await dispatchToolBatch({
      batch: batch([
        { id: "call-read", name: "read", arguments: { path: "a.ts" } },
        {
          id: "call-redacted",
          name: "bash",
          arguments: { command: "printf token=secret" },
        },
      ]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "sequential",
      dispatch: createToolDispatcherBatchDispatch({
        async dispatch(name, args) {
          dispatched.push({ name, args });
          return { success: true, content: "safe result" };
        },
      }),
    });

    expect(dispatched).toEqual([{ name: "read", args: { path: "a.ts" } }]);
    expect(result.dispatchPlan.calls.map((call) => call.notDispatchedReason)).toEqual([
      undefined,
      "arguments_not_report_safe",
    ]);
    expect(result.resultDetails.map((detail) => detail.resultStatus)).toEqual([
      "executed_success",
      "not_dispatched",
    ]);
    expect(result.notDispatchedToolCallIds).toEqual(["call-redacted"]);
  });

  it("plans independent read-only calls as one parallel group and excludes mutation from parallel dispatch", async () => {
    const dispatched: string[] = [];
    const result = await dispatchToolBatch({
      batch: batch([
        { id: "call-read-a", name: "read", arguments: { path: "a.ts" } },
        { id: "call-read-b", name: "read", arguments: { path: "b.ts" } },
        { id: "call-edit", name: "edit", arguments: { path: "a.ts", oldText: "old", newText: "new" } },
      ]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "parallel",
      dispatch: async (call) => {
        dispatched.push(call.id);
        return { success: true, content: `safe ${call.id}` };
      },
    });

    expect(result.dispatchPlan.schedulingPlan.executionMode).toBe("parallel_read_only");
    expect(result.dispatchPlan.schedulingPlan.parallelGroupIds).toHaveLength(1);
    expect(result.dispatchPlan.calls.map((call) => call.effect)).toEqual([
      "read_only",
      "read_only",
      "mutation",
    ]);
    expect(dispatched).toEqual(["call-read-a", "call-read-b"]);
    expect(result.dispatchPlan.calls.find((call) => call.toolCallId === "call-edit")?.dispatchStatus).not.toBe("dispatched");
    expect(result.resultDetails.map((detail) => detail.toolCallId)).toEqual([
      "call-read-a",
      "call-read-b",
      "call-edit",
    ]);
    expect(result.terminalSuccessClaim).toBe(false);
  });

  it("keeps deterministic result order when parallel completions arrive out of order", async () => {
    const finished: string[] = [];
    const result = await dispatchToolBatch({
      batch: batch([
        { id: "call-read-slow", name: "read", arguments: { path: "slow.ts" } },
        { id: "call-read-fast", name: "read", arguments: { path: "fast.ts" } },
      ]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "parallel",
      dispatch: async (call) => {
        if (call.id === "call-read-slow") {
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
        finished.push(call.id);
        return { success: true, content: `safe ${call.id}` };
      },
    });

    expect(finished).toEqual(["call-read-fast", "call-read-slow"]);
    expect(result.dispatchPlan.schedulingPlan.deterministicOrder).toEqual([
      "call-read-slow",
      "call-read-fast",
    ]);
    expect(result.resultDetails.map((detail) => detail.toolCallId)).toEqual([
      "call-read-slow",
      "call-read-fast",
    ]);
  });

  it("records cancellation, timeout, skipped dependent, blocked conflict, and partial failure facts", async () => {
    const controllerBefore = new AbortController();
    controllerBefore.abort();
    const cancelledBefore = await dispatchToolBatch({
      batch: batch([{ id: "call-read", name: "read", arguments: { path: "a.ts" } }]),
      context: { taskId: "task", workspaceRoot: "/workspace", abortSignal: controllerBefore.signal },
      dispatchPolicy: "parallel",
      dispatch: async () => ({ success: true, content: "not reached" }),
    });
    const controllerDuring = new AbortController();
    const cancelledDuring = await dispatchToolBatch({
      batch: batch([
        { id: "call-read-a", name: "read", arguments: { path: "a.ts", afterCallIds: ["call-read-missing"] } },
        { id: "call-read-b", name: "read", arguments: { path: "b.ts", afterCallIds: ["call-read-a"] } },
      ]),
      context: { taskId: "task", workspaceRoot: "/workspace", abortSignal: controllerDuring.signal },
      dispatchPolicy: "parallel",
      dispatch: async (call) => {
        if (call.id === "call-read-a") {
          controllerDuring.abort();
          return { success: true, content: "safe before cancellation" };
        }
        return { success: true, content: "not reached" };
      },
    });
    const timeout = await dispatchToolBatch({
      batch: batch([{ id: "call-read-timeout", name: "read", arguments: { path: "timeout.ts" } }]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "parallel",
      dispatch: async () => ({
        success: false,
        content: "safe timeout summary",
        metadata: { executionStatus: "timeout" },
      }),
    });
    const blocked = await dispatchToolBatch({
      batch: batch([
        { id: "call-read-conflict", name: "read", arguments: { path: "a.ts", conflictsWithCallIds: ["call-read-other"] } },
        { id: "call-unsupported-dependent", name: "unsupported-tool", arguments: { afterCallIds: ["call-read-conflict"] } },
      ]),
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "parallel",
      dispatch: async () => ({ success: true, content: "not reached" }),
    });

    expect(cancelledBefore.resultDetails.map((detail) => detail.resultStatus)).toEqual(["cancelled"]);
    expect(cancelledDuring.resultDetails.map((detail) => detail.resultStatus)).toEqual([
      "executed_success",
      "cancelled",
    ]);
    expect(cancelledDuring.schedulingStates.map((state) => state.executionState)).toEqual([
      "completed",
      "cancelled",
    ]);
    expect(timeout.resultDetails[0]?.resultStatus).toBe("timed_out");
    expect(blocked.dispatchPlan.schedulingPlan.calls.map((call) => call.dependency.kind)).toEqual([
      "conflicts_with",
      "ordered_after",
    ]);
    expect(blocked.dispatchPlan.schedulingPlan.skippedCallIds).toEqual(["call-unsupported-dependent"]);
    expect(blocked.resultDetails.map((detail) => detail.resultStatus)).toEqual([
      "blocked_by_policy",
      "unknown_tool",
    ]);
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
