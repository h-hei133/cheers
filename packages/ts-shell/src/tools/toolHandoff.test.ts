import { describe, expect, it } from "vitest";

import { createEvidenceOnlySavePoint } from "../evidence/savepoint/model.js";
import { createModelResponseBoundary } from "../provider/response/boundary.js";
import { projectJsonRuntimeEventStream } from "../runtime/events/stream.js";
import { projectRuntimeEvents } from "../runtime/events/projection.js";
import { createRuntimeTurnSnapshot } from "../turn/turnSnapshot.js";
import { accumulateAssistantResponse } from "../turn/assistantResponse.js";
import { prepareNextTurnBundle } from "../turn/nextTurnBundle.js";
import { prepareToolResultMessages } from "../turn/toolResultMessage.js";
import { createToolBeforePolicyDecision } from "./policy/interception.js";
import { extractToolCallBatch } from "./toolCallBatch.js";
import { createToolBatchHandoff, prepareSafeToolBatchHandoff } from "./toolHandoff.js";

describe("tool batch handoff", () => {
  it("creates safe handoff facts from a completed model boundary without execution", () => {
    const prepared = prepare([
      { id: "call-read", name: "read", arguments: { path: "a.ts" } },
    ]);
    const messages = prepareToolResultMessages({
      dispatchPlan: prepared.dispatchPlan,
      resultDetails: prepared.resultDetails,
    });
    const handoff = createToolBatchHandoff({
      ...prepared.sources,
      dispatchPlan: prepared.dispatchPlan,
      resultDetails: prepared.resultDetails,
      resultMessages: messages,
    });

    expect(handoff).toMatchObject({
      extractionStatus: "extracted",
      dispatchEligibility: "not_dispatched",
      executionStatus: "not_dispatched",
      authorityRequirement: "none",
      terminalSuccessClaim: false,
    });
    expect(handoff.normalizedToolCallIds).toEqual(["call-read"]);
    expect(handoff.nonExecutedResultDetailIds).toEqual(["tool-result-detail:call-read"]);
    expect(handoff.nonExecutedMessageIds).toEqual(["tool-result-message:call-read"]);
    expect(handoff.notProvenClaims).toEqual(
      expect.arrayContaining([
        "tool-call-extracted-is-not-tool-executed",
        "tool-batch-planned-is-not-tool-result",
        "non-executed-message-is-not-tool-success",
      ]),
    );
    expect(JSON.stringify(handoff)).not.toContain('"success":true');
  });

  it("classifies malformed, unsupported, and unknown calls with redaction preserved", () => {
    const prepared = prepare([
      { id: "call-malformed" },
      { id: "call-unsupported", name: "tool.experimental", arguments: { command: "token=secret" } },
      { id: "call-unknown", name: "mystery", arguments: { path: "safe.ts" } },
    ]);
    const categories = prepareToolResultMessages({
      dispatchPlan: prepared.dispatchPlan,
      resultDetails: prepared.resultDetails,
    }).messages.map((message) => message.category);

    expect(prepared.sources.toolCallBatch).toMatchObject({
      extractionStatus: "partial",
      malformedCallCount: 1,
      unsupportedCallCount: 1,
      unknownCallCount: 1,
      redaction: { status: "redacted" },
    });
    expect(prepared.handoff.malformedCallIds).toEqual(["call-malformed"]);
    expect(prepared.handoff.unsupportedCallIds).toEqual(["call-unsupported"]);
    expect(prepared.handoff.unknownToolCallIds).toEqual(["call-unknown"]);
    expect(categories).toEqual([
      "malformed_arguments",
      "unsupported_tool",
      "unknown_tool",
    ]);
    expect(JSON.stringify(prepared)).not.toMatch(/token=secret|cheers-real|provider\.env/i);
  });

  it("projects policy and authority states without executing tools", () => {
    const prepared = prepare(
      [
        { id: "call-read", name: "read", arguments: { path: "a.ts" } },
        { id: "call-bash", name: "bash", arguments: { command: "printf ok" } },
        { id: "call-write", name: "write", arguments: { path: "a.ts" } },
      ],
      (call, intent) => {
        if (call.id === "call-bash") {
          return createToolBeforePolicyDecision({
            intent,
            status: "request_authority",
            reason: "authority required",
            policySource: "test policy",
          });
        }
        if (call.id === "call-write") {
          return createToolBeforePolicyDecision({
            intent,
            status: "block",
            reason: "blocked",
            policySource: "test policy",
          });
        }
        return undefined;
      },
    );
    const messages = prepareToolResultMessages({
      dispatchPlan: prepared.dispatchPlan,
      resultDetails: prepared.resultDetails,
    });

    expect(prepared.dispatchPlan.executionStatus).toBe("not_dispatched");
    expect(prepared.dispatchPlan.dispatchedCallIds).toEqual([]);
    expect(prepared.dispatchPlan.authorityRequiredCallIds).toEqual(["call-bash"]);
    expect(prepared.dispatchPlan.blockedCallIds).toEqual(["call-write"]);
    expect(messages.messages.map((message) => message.category)).toEqual([
      "not_dispatched",
      "authority_required",
      "blocked_by_policy",
    ]);
    expect(prepared.handoff.notProvenClaims).toContain(
      "authority-requested-is-not-authority-granted",
    );
  });

  it("projects runtime events, JSON stream, save point, and next-turn inputs as observation-only", () => {
    const prepared = prepare([
      { id: "call-read", name: "read", arguments: { path: "a.ts" } },
    ]);
    const messages = prepareToolResultMessages({
      dispatchPlan: prepared.dispatchPlan,
      resultDetails: prepared.resultDetails,
    });
    const nextTurn = prepareNextTurnBundle({
      bundleId: "bundle-tool",
      turnId: "turn-handoff",
      toolResultMessages: messages,
    });
    const savePoint = createEvidenceOnlySavePoint({
      turnSnapshot: createRuntimeTurnSnapshot({
        sessionId: "sess-handoff",
        turn: 1,
        phase: "turn",
        workspaceRoot: "/workspace",
        providerOptIn: false,
      }),
      phase: "save_point",
      evidenceIds: ["tool-result-batch:batch-tool"],
      toolResultMessageIds: messages.messages.map((message) => message.messageId),
      toolResultDetailIds: prepared.resultDetails.map((detail) => detail.resultDetailsId),
      beforeToolDecisionIds: prepared.dispatchPlan.calls.map((call) => call.policyDecisionId),
      nextTurnBundleId: nextTurn.bundleId,
      pendingNextTurnFacts: ["next-turn:not-executed"],
    });
    const handoff = createToolBatchHandoff({
      ...prepared.sources,
      dispatchPlan: prepared.dispatchPlan,
      resultDetails: prepared.resultDetails,
      resultMessages: messages,
      savePointInputId: savePoint.id,
      nextTurnInputId: nextTurn.bundleId,
    });
    const events = projectRuntimeEvents({
      toolBatchHandoffs: [handoff],
      toolDispatchPlans: [prepared.dispatchPlan],
      toolResultDetails: prepared.resultDetails,
      toolResultMessages: [messages],
      savePoint,
      nextTurnBundles: [nextTurn],
    });
    const stream = projectJsonRuntimeEventStream({ events, streamId: "stream-handoff" });

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "tool-batch-handoff-observed",
        "tool-batch-planned",
        "tool-call-not-dispatched",
        "non-executed-result-message-prepared",
        "tool-batch-observation-completed",
        "next-turn-bundle-prepared",
      ]),
    );
    expect(stream.every((entry) => entry.truthfulness.observationOnly)).toBe(true);
    expect(stream.every((entry) => entry.truthfulness.terminalSuccessClaim === false)).toBe(true);
    expect(savePoint.nextTurnBundleId).toBe("bundle-tool");
    expect(nextTurn.sourceToolResultMessageIds).toEqual(["tool-result-message:call-read"]);
  });
});

function prepare(
  candidates: readonly unknown[],
  policy?: Parameters<typeof prepareSafeToolBatchHandoff>[0]["policy"],
) {
  const responseBoundary = createModelResponseBoundary({
    responseId: "response-handoff",
    turnId: "turn-handoff",
    source: "existing_safe_projection",
    status: "observed",
    toolCallCount: candidates.length,
  });
  const assistantResponse = accumulateAssistantResponse({
    responseBoundary,
    turnId: "turn-handoff",
    chunks: [{ toolCalls: candidates }],
  });
  const toolCallBatch = extractToolCallBatch({
    responseBoundary,
    assistantResponse,
    batchId: "batch-tool",
  });
  const prepared = prepareSafeToolBatchHandoff({
    responseBoundary,
    assistantResponse,
    toolCallBatch,
    policy,
  });
  return {
    ...prepared,
    sources: {
      responseBoundary,
      assistantResponse,
      toolCallBatch,
    },
  };
}
