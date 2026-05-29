import { describe, expect, it } from "vitest";

import { createCommandToolResultSplit } from "../../tools/resultSplit.js";
import { projectJsonRuntimeEventStream } from "../events/jsonEventStream.js";
import { createCommandExecutionReceipt } from "../execution/executionReceipt.js";
import {
  runAgentLoopContract,
  type AgentLoopContractToolResultBatch,
} from "./agentLoopContract.js";

describe("agent loop contract", () => {
  it("models a no-tool path without claiming terminal success", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess-loop-no-tool",
      workspaceRoot: "/workspace",
      prompt: "answer only",
      providerOptIn: false,
      modelBoundary: async () => ({
        responseId: "response-no-tool",
        stopReason: "stop",
        safeSummary: "assistant response observed",
      }),
    });

    expect(loop.state).toBe("stopped");
    expect(loop.stopReason).toBe("model-stop");
    expect(loop.turns).toHaveLength(1);
    expect(loop.turns[0]?.modelBoundary.toolCallCount).toBe(0);
    expect(loop.terminalSuccessClaim).toBe(false);
    expect(loop.notProvenClaims).toContain("terminal-success");
    expect(loop.turns[0]?.savePoint.terminalSuccessClaim).toBe(false);
  });

  it("models a tool call batch and evidence-only save point", async () => {
    const receipt = makeReceipt("batch");
    const split = createCommandToolResultSplit({
      receipt,
      content: "safe summary",
      runtimeFacts: { observation: "tool-result-observed" },
    });

    const loop = await runAgentLoopContract({
      sessionId: "sess-loop-tool",
      workspaceRoot: "/workspace",
      prompt: "use tools",
      providerOptIn: false,
      maxTurns: 1,
      toolBatchPolicy: "sequential",
      modelBoundary: async () => ({
        responseId: "response-tool",
        stopReason: "tool-calls",
        toolCalls: [
          { id: "call-a", name: "read", arguments: { path: "a.ts" } },
          { id: "call-b", name: "git-status", arguments: { short: true } },
        ],
      }),
      toolBatchBoundary: async (batch): Promise<AgentLoopContractToolResultBatch> => ({
        id: "tool-result-batch",
        callBatchId: batch.id,
        results: [
          { success: true, ...split },
          { success: false, error: "denied", reportSafe: split.reportSafe },
        ],
        executionReceipts: [receipt],
        failedToolCallIds: ["call-b"],
        terminate: false,
      }),
    });

    const turn = loop.turns[0];
    expect(turn?.toolCallBatch?.policy).toBe("sequential");
    expect(turn?.toolCallBatch?.calls.map((call) => call.argumentKeys)).toEqual([
      ["path"],
      ["short"],
    ]);
    expect(turn?.toolResultBatch?.failedToolCallIds).toEqual(["call-b"]);
    expect(turn?.savePoint.executionReceipts).toHaveLength(1);
    expect(turn?.savePoint.resultProjectionStatus).toBe("observed-not-verdict");
    expect(loop.events.map((event) => event.type)).toContain(
      "agent-loop-tool-result-batch-observed",
    );
  });

  it("keeps save point and next turn preparation truthfulness separate", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess-loop-truth",
      workspaceRoot: "/workspace",
      prompt: "continue",
      providerOptIn: false,
      maxTurns: 1,
      modelBoundary: async () => ({
        responseId: "response-truth",
        stopReason: "stop",
      }),
    });

    const turn = loop.turns[0];
    expect(turn?.nextTurn.prepared).toBe(true);
    expect(turn?.nextTurn.pendingFacts).toEqual([
      "turn:1",
      "model-response:stop",
    ]);
    expect(turn?.savePoint.notProvenClaims).toEqual(
      expect.arrayContaining([
        "provider-success",
        "verification-success",
        "terminal-success",
      ]),
    );
    expect(
      loop.events.every(
        (event) => event.facts.terminalSuccessClaim === false,
      ),
    ).toBe(true);
  });

  it("delivers next-turn, steering, and follow-up messages by contract", async () => {
    const deliveredByTurn: string[][] = [];
    const loop = await runAgentLoopContract({
      sessionId: "sess-loop-delivery",
      workspaceRoot: "/workspace",
      prompt: "queued",
      providerOptIn: false,
      maxTurns: 2,
      queuedMessages: [
        { id: "next", mode: "next-turn", text: "next turn context" },
        { id: "steer", mode: "steer", text: "steer now" },
        { id: "follow", mode: "follow-up", text: "follow after stop" },
      ],
      modelBoundary: async ({ deliveredMessages, turn }) => {
        deliveredByTurn.push(deliveredMessages.map((message) => message.mode));
        return {
          responseId: `response-${turn}`,
          stopReason: "stop",
        };
      },
    });

    expect(deliveredByTurn).toEqual([
      ["next-turn", "steer"],
      ["follow-up"],
    ]);
    expect(loop.pendingDelivery).toEqual({
      steer: 0,
      followUp: 0,
      nextTurn: 0,
    });
    expect(
      loop.events.filter((event) => event.type === "agent-loop-delivery-delivered"),
    ).toHaveLength(3);
    expect(
      loop.events.filter((event) => event.type === "agent-loop-delivery-queued"),
    ).toHaveLength(3);
  });

  it("projects abort and failure without terminal success", async () => {
    const aborted = await runAgentLoopContract({
      sessionId: "sess-loop-abort",
      workspaceRoot: "/workspace",
      prompt: "abort",
      providerOptIn: false,
      modelBoundary: async () => ({
        responseId: "response-aborted",
        stopReason: "aborted",
      }),
    });
    const failed = await runAgentLoopContract({
      sessionId: "sess-loop-fail",
      workspaceRoot: "/workspace",
      prompt: "fail",
      providerOptIn: false,
      modelBoundary: async () => {
        throw new Error("provider boundary failed");
      },
    });

    expect(aborted.state).toBe("aborted");
    expect(failed.state).toBe("failed");
    expect(failed.failureClass).toBe("model-boundary");
    expect(
      [...aborted.events, ...failed.events].every(
        (event) => event.facts.terminalSuccessClaim === false,
      ),
    ).toBe(true);
  });

  it("emits stable JSON-safe event ordering", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess-loop-events",
      workspaceRoot: "/workspace",
      prompt: "events",
      providerOptIn: false,
      modelBoundary: async () => ({
        responseId: "response-events",
        stopReason: "stop",
      }),
    });
    const stream = projectJsonRuntimeEventStream({
      streamId: "sess-loop-events",
      events: loop.events,
    });

    expect(loop.events.map((event) => event.sequence)).toEqual(
      Array.from({ length: loop.events.length }, (_, index) => index + 1),
    );
    expect(stream.map((event) => event.order)).toEqual(
      Array.from({ length: stream.length }, (_, index) => index + 1),
    );
    expect(JSON.parse(JSON.stringify(stream))).toEqual(stream);
    expect(stream[0]?.eventType).toBe("agent-loop-started");
  });

  it("redacts unsafe loop state and event facts", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess-loop-redaction",
      workspaceRoot: "/workspace",
      prompt: "redact",
      providerOptIn: false,
      queuedMessages: [
        {
          id: "secret",
          mode: "next-turn",
          text: "token=secret oldText=before newText=after /home/wang/.private-agents-real/provider.env",
        },
      ],
      modelBoundary: async () => ({
        responseId: "sk-1234567890",
        stopReason: "stop",
        safeSummary: "raw provider output: hidden reasoning token=secret",
      }),
    });
    const serialized = JSON.stringify(projectJsonRuntimeEventStream({
      events: loop.events,
    }));

    expect(serialized).not.toMatch(
      /private-agents-real|sk-1234567890|token=secret|oldText=before|newText=after|hidden reasoning/i,
    );
    expect(serialized).toMatch(/redacted|raw-content-excluded/);
  });
});

function makeReceipt(id: string) {
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
      reason: `receipt ${id}`,
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
