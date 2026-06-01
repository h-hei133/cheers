import { describe, expect, it } from "vitest";

import { createModelResponseBoundary } from "../../provider/response/boundary.js";
import type { ControlledModelInvocationAdapterProjection } from "../../provider/request/attempt.js";
import { projectModelResponseReentryCycle } from "./reentry.js";

describe("model response reentry cycle", () => {
  it("lets a safe response handoff reenter the model boundary without task success", () => {
    const cycle = projectModelResponseReentryCycle({
      controlledInvocation: adapter(),
      responseBoundary: responseBoundary({ content: "safe assistant summary", toolCallCount: 1 }),
      toolCallCandidates: [
        { id: "call-read", name: "read", arguments: { path: "src/a.ts" } },
      ],
    });

    expect(cycle.responseReentry).toMatchObject({
      reentryStatus: "processed",
      rawOutputExcluded: true,
      terminalSuccessClaim: false,
    });
    expect(cycle.assistantAccumulation).toMatchObject({
      contentAvailability: "available",
      contentSummarySafeLabel: "report-safe-summary-present",
      hiddenChannelExcluded: true,
      terminalSuccessClaim: false,
    });
    expect(cycle.toolExtraction).toMatchObject({
      extractedCallIds: ["call-read"],
      handoffReadiness: "ready_for_tool_handoff",
      terminalSuccessClaim: false,
    });
    expect(cycle.cycleBoundary).toMatchObject({
      nextHandoffKind: "tool_batch",
      cycleStatus: "tool_handoff_ready",
      continuationRequirement: "tool_handoff_required",
      terminalSuccessClaim: false,
    });
    expect(JSON.stringify(cycle)).not.toContain('"success":true');
    expect(cycle.notProvenClaims).toEqual(
      expect.arrayContaining([
        "response-handoff-is-not-final-assistant-success",
        "assistant-accumulated-is-not-task-success",
        "tool-extracted-is-not-tool-executed",
        "cycle-boundary-is-not-terminal-success",
      ]),
    );
  });

  it("blocks failed, cancelled, redaction-failed, invalid, and insufficient responses", () => {
    const cases = [
      ["failed", "failed", "blocked_by_failed_attempt", "failed_response"],
      ["cancelled", "cancelled", "blocked_by_cancelled_attempt", "cancelled_response"],
      ["redaction_failed", "redaction_failed", "blocked_by_redaction", "blocked_response"],
      ["output_invalid", "output_invalid", "blocked_by_invalid_output", "blocked_response"],
      ["output_insufficient", "output_insufficient", "blocked_by_insufficient_output", "blocked_response"],
    ] as const;

    for (const [outcomeStatus, classification, reentryStatus, cycleStatus] of cases) {
      const cycle = projectModelResponseReentryCycle({
        controlledInvocation: adapter({ outcomeStatus, classification }),
      });

      expect(cycle.responseReentry.reentryStatus).toBe(reentryStatus);
      expect(cycle.cycleBoundary.cycleStatus).toBe(cycleStatus);
      expect(cycle.assistantAccumulation).toBeUndefined();
      expect(cycle.toolExtraction).toBeUndefined();
      expect(cycle.terminalSuccessClaim).toBe(false);
    }
  });

  it("keeps malformed, unsupported, and unknown tool calls visible without execution", () => {
    const cycle = projectModelResponseReentryCycle({
      controlledInvocation: adapter(),
      responseBoundary: responseBoundary({ content: "safe tool request", toolCallCount: 4 }),
      toolCallCandidates: [
        { id: "call-read", name: "read", arguments: { path: "a.ts" } },
        { name: "missing-id" },
        { id: "call-unsupported", name: "unsupported.tool", arguments: { token: "secret" } },
        { id: "call-unknown", name: "unknownTool", arguments: { ok: true } },
      ],
    });

    expect(cycle.toolExtraction).toMatchObject({
      extractionConfidence: "partial",
      handoffReadiness: "ready_for_tool_handoff",
      malformedCallIds: ["malformed-tool-call-2"],
      unsupportedCallIds: ["call-unsupported"],
      unknownToolIds: ["call-unknown"],
      noToolStatus: "not_observed",
    });
    expect(cycle.cycleBoundary.cycleStatus).toBe("partial_response");
    expect(cycle.toolBatchHandoff?.executionStatus).toBe("not_dispatched");
    expect(JSON.stringify(cycle)).not.toMatch(/token=secret|raw provider output|hidden reasoning/i);
  });

  it("represents no-tool responses without claiming task completion", () => {
    const cycle = projectModelResponseReentryCycle({
      controlledInvocation: adapter({
        toolCallExtractionReadiness: "no_tool_calls",
      }),
      responseBoundary: responseBoundary({ content: "safe final-looking text", toolCallCount: 0 }),
    });

    expect(cycle.toolExtraction).toMatchObject({
      noToolStatus: "observed",
      handoffReadiness: "no_tool_calls",
      extractionConfidence: "none",
    });
    expect(cycle.cycleBoundary).toMatchObject({
      cycleStatus: "no_tool_response_observed",
      nextHandoffKind: "none",
      continuationRequirement: "no_automatic_continuation",
      terminalSuccessClaim: false,
    });
    expect(cycle.notProvenClaims).toContain("no-tool-response-is-not-task-completion");
  });

  it("redacts unsafe response labels and never exposes raw provider output", () => {
    const cycle = projectModelResponseReentryCycle({
      controlledInvocation: adapter(),
      responseBoundary: responseBoundary({
        content:
          "token=secret raw provider output: hidden reasoning /home/wang/.private-agents-real/provider.env oldText=before newText=after",
        toolCallCount: 0,
      }),
    });

    const serialized = JSON.stringify(cycle);
    expect(cycle.responseReentry.reentryStatus).toBe("blocked_by_redaction");
    expect(serialized).not.toMatch(
      /token=secret|private-agents-real|provider\.env|raw provider output|hidden reasoning|oldText=before|newText=after/i,
    );
  });
});

function responseBoundary(input: {
  readonly content: string;
  readonly toolCallCount: number;
}) {
  return createModelResponseBoundary({
    responseId: "response-a",
    turnId: "turn-a",
    providerMode: "real",
    providerSafeLabel: "Provider A",
    modelSafeLabel: "Model A",
    source: "existing_safe_projection",
    status: "observed",
    assistantContent: input.content,
    toolCallCount: input.toolCallCount,
  });
}

function adapter(input: {
  readonly outcomeStatus?: ControlledModelInvocationAdapterProjection["outcome"]["status"];
  readonly classification?: NonNullable<ControlledModelInvocationAdapterProjection["responseHandoff"]>["responseClassification"];
  readonly toolCallExtractionReadiness?: NonNullable<ControlledModelInvocationAdapterProjection["responseHandoff"]>["toolCallExtractionReadiness"];
} = {}): ControlledModelInvocationAdapterProjection {
  const outcomeStatus = input.outcomeStatus ?? "completed";
  const classification = input.classification ?? "completed";
  return {
    adapterId: "adapter-a",
    sourceGateId: "gate-a",
    sourcePreparedRequestId: "prepared-a",
    providerSafeLabel: "Provider A",
    modelSafeLabel: "Model A",
    invocationMode: "controlled_provider_fetch",
    controlledOptInState: "present",
    attemptDecision: "execute_via_provider_fetch",
    attemptId: "attempt-a",
    redactionState: classification === "redaction_failed" ? "redacted" : "report-safe",
    outcome: {
      attemptId: "attempt-a",
      sourceGateId: "gate-a",
      providerSafeLabel: "Provider A",
      modelSafeLabel: "Model A",
      status: outcomeStatus,
      retryEligibility: "retry_not_allowed",
      fallbackEligibility: "fallback_unknown",
      fallbackAttempted: false,
      responseHandoffId: "handoff-a",
      redactionState: classification === "redaction_failed" ? "redacted" : "report-safe",
      notProvenClaims: ["completed-provider-fact-is-not-task-success"],
      terminalSuccessClaim: false,
    },
    responseHandoff: {
      responseHandoffId: "handoff-a",
      sourceAttemptId: "attempt-a",
      responseClassification: classification,
      assistantContentAvailability: classification === "redaction_failed" ? "redacted" : "available",
      toolCallExtractionReadiness: input.toolCallExtractionReadiness ?? "ready",
      modelResponseBoundaryId: "response-a",
      redactionStatus: classification === "redaction_failed" ? "redacted" : "report-safe",
      rawOutputExcluded: true,
      notProvenClaims: ["response-handoff-is-not-final-assistant-success"],
      terminalSuccessClaim: false,
    },
    attemptEnvelope: {
      attemptId: "attempt-a",
      sourceGateId: "gate-a",
      sourcePreparedRequestId: "prepared-a",
      providerSafeLabel: "Provider A",
      modelSafeLabel: "Model A",
      invocationMode: "controlled_provider_fetch",
      attemptStatus: outcomeStatus === "completed" ? "completed" : "failed",
      retryEligibility: "retry_not_allowed",
      fallbackEligibility: "fallback_unknown",
      fallbackAttempted: false,
      redactionState: classification === "redaction_failed" ? "redacted" : "report-safe",
      notProvenClaims: ["attempt-is-not-provider-success"],
      terminalSuccessClaim: false,
    },
    notProvenClaims: ["attempt-is-not-provider-success"],
    terminalSuccessClaim: false,
  };
}
