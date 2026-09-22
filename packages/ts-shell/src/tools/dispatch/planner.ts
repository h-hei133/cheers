import type { NormalizedToolCall, NormalizedToolCallBatch } from "../toolCallBatch.js";
import {
  createToolBeforePolicyDecision,
  createToolInterceptionIntent,
  type ToolBeforePolicyDecision,
} from "../policy/interception.js";
import { classifyToolEffect } from "../policy/effects.js";
import {
  planToolScheduling,
  type ToolSchedulingCallFacts,
} from "../scheduling/plan.js";
import type {
  ToolBatchDispatchPlan,
  ToolBatchDispatchStatus,
  ToolBatchPolicy,
  ToolCallDispatchStatus,
  ToolDispatchPlanCall,
  ToolExecutionState,
} from "./types.js";

export function planToolBatchDispatch(input: {
  readonly batch: NormalizedToolCallBatch;
  readonly dispatchPolicy?: "sequential" | "parallel" | "metadata-only";
  readonly policy?: ToolBatchPolicy;
  readonly caller?: string;
}): ToolBatchDispatchPlan {
  const dispatchPolicy = input.dispatchPolicy ?? "metadata-only";
  const policyInputs = input.batch.calls.map((call) => {
    const intent = createToolInterceptionIntent({
      toolId: call.id,
      toolKind: call.name,
      caller: input.caller ?? "tool-batch-dispatch",
      operationKind: `tool.${call.name}`,
      requestedActionSummary: `${call.name}: ${call.argumentSummary}`,
      authorityMode:
        call.name === "bash" ? "command-allowlisted" : "unknown-transitional",
      riskLevel: call.riskLevel,
      notProvenClaims: call.notProvenClaims,
    });
    const beforePolicyDecision =
      input.policy?.(call, intent) ??
      defaultPolicyDecision(call, intent, dispatchPolicy);
    const effectFacts = classifyToolEffect({
      call,
      decision: beforePolicyDecision,
    });
    return { call, beforePolicyDecision, effectFacts };
  });

  const schedulingPlan = planToolScheduling({
    batchId: input.batch.batchId,
    requestedPolicy: dispatchPolicy,
    calls: policyInputs.map(({ call, effectFacts }) => ({
      call,
      effect: effectFacts,
    })),
  });

  const calls: ToolDispatchPlanCall[] = policyInputs.map(
    ({ call, beforePolicyDecision, effectFacts }) => {
      const schedulingFacts = schedulingPlan.calls.find(
        (candidate) => candidate.toolCallId === call.id,
      );
      const redactionStatus: "report-safe" | "redacted" =
        call.redaction.status === "redacted" ||
        beforePolicyDecision.redactionStatus === "redacted"
          ? "redacted"
          : "report-safe";
      const dispatchStatus = statusFromPolicy(
        call,
        beforePolicyDecision,
        dispatchPolicy,
        schedulingFacts,
      );
      const knownToolStatus: ToolDispatchPlanCall["knownToolStatus"] =
        call.status === "unknown" || call.kind === "unknown"
          ? "unknown"
          : "known";
      const supportedStatus: ToolDispatchPlanCall["supportedStatus"] =
        call.kind === "allowlisted" ? "supported" : "unsupported";

      return {
        toolCallId: call.id,
        toolName: call.name,
        callKind: call.kind,
        safeToolLabel: call.name,
        callStatus: call.status,
        knownToolStatus,
        supportedStatus,
        dispatchStatus,
        dispatchEligibility: dispatchStatus,
        authorityGrantStatus: authorityGrantStatus(
          beforePolicyDecision,
          dispatchStatus,
        ),
        ...(dispatchStatus === "dispatched"
          ? {}
          : {
              notDispatchedReason: notDispatchedReason(
                call,
                beforePolicyDecision,
                dispatchStatus,
                dispatchPolicy,
              ),
            }),
        beforePolicyDecision,
        policyDecisionId: beforePolicyDecision.decisionId,
        authorityRequirement: beforePolicyDecision.authorityRequirement,
        effect: effectFacts.effect,
        effectReason: effectFacts.reason,
        dependency: schedulingFacts?.dependency ?? {
          kind: "unknown" as const,
          afterCallIds: [],
          conflictCallIds: [],
          reason: "dependency facts unavailable",
          terminalSuccessClaim: false as const,
        },
        schedulingDecision: schedulingFacts?.decision ?? "blocked",
        ...(schedulingFacts?.groupId
          ? { schedulingGroupId: schedulingFacts.groupId }
          : {}),
        schedulingGroupMode: schedulingFacts?.groupMode ?? "blocked",
        argumentSafety: call.redaction.status,
        redactionStatus,
        malformed: call.status === "malformed",
        unsupported: call.status === "unsupported",
        unknownTool:
          call.status !== "malformed" &&
          (call.status === "unknown" || call.kind === "unknown"),
        executionState: executionStateFromPlan(
          call,
          dispatchStatus,
          input.dispatchPolicy,
        ),
        notProvenClaims: Array.from(
          new Set([
            ...call.notProvenClaims,
            ...beforePolicyDecision.notProvenClaims,
          ]),
        ),
        terminalSuccessClaim: false as const,
      };
    },
  );

  const dispatchStatus = summarizePlanStatus(calls);

  return {
    planId: `tool-dispatch-plan:${input.batch.batchId}`,
    batchId: input.batch.batchId,
    responseId: input.batch.responseId,
    ...(input.batch.turnId ? { turnId: input.batch.turnId } : {}),
    dispatchPolicy,
    requestedDispatchPolicy: dispatchPolicy,
    schedulingPlan,
    dispatchStatus,
    calls,
    authorityRequiredCallIds: calls
      .filter((call) => call.dispatchStatus === "authority_required")
      .map((call) => call.toolCallId),
    blockedCallIds: calls
      .filter((call) => call.dispatchStatus === "blocked")
      .map((call) => call.toolCallId),
    malformedCallIds: calls
      .filter((call) => call.malformed)
      .map((call) => call.toolCallId),
    unsupportedCallIds: calls
      .filter((call) => call.unsupported)
      .map((call) => call.toolCallId),
    unknownCallIds: calls
      .filter((call) => call.unknownTool && !call.malformed)
      .map((call) => call.toolCallId),
    notDispatchedCallIds: calls
      .filter((call) => call.dispatchStatus === "not_dispatched")
      .map((call) => call.toolCallId),
    dispatchedCallIds: calls
      .filter((call) => call.dispatchStatus === "dispatched")
      .map((call) => call.toolCallId),
    executionStatus: calls.some((call) => call.dispatchStatus === "dispatched")
      ? calls.every((call) => call.dispatchStatus === "dispatched")
        ? "dispatched"
        : "partially_dispatched"
      : "not_dispatched",
    schedulingStatus: schedulingPlan.executionMode,
    redactionStatus:
      input.batch.redaction.status === "redacted" ||
      calls.some((call) => call.redactionStatus === "redacted")
        ? "redacted"
        : "report-safe",
    notProvenClaims: Array.from(
      new Set([
        "terminal-success",
        "task-success",
        "verification-success",
        "tool-success",
        ...(dispatchStatus === "not_dispatched"
          ? ["tool-dispatch-not-run"]
          : []),
        ...input.batch.notProvenClaims,
        ...schedulingPlan.notProvenClaims,
        ...calls.flatMap((call) => call.notProvenClaims),
      ]),
    ),
    terminalSuccessClaim: false,
  };
}

export function defaultPolicyDecision(
  call: NormalizedToolCall,
  intent: ReturnType<typeof createToolInterceptionIntent>,
  dispatchPolicy: ToolBatchDispatchPlan["dispatchPolicy"],
): ToolBeforePolicyDecision {
  if (call.status === "malformed") {
    return createToolBeforePolicyDecision({
      intent,
      status: "rejected",
      reason: "tool call is malformed",
      policySource: "tool-batch-dispatch",
      reportSafeSummary: call.argumentSummary,
      notProvenClaims: ["tool-call-malformed"],
    });
  }
  if (call.status === "unknown" || call.kind === "unknown") {
    return createToolBeforePolicyDecision({
      intent,
      status: "unsupported",
      reason:
        "tool call name is not recognized by the current sanctioned dispatch set",
      policySource: "tool-batch-dispatch",
      reportSafeSummary: call.argumentSummary,
      notProvenClaims: ["tool-dispatch-unknown"],
    });
  }
  if (call.status === "unsupported" || call.kind !== "allowlisted") {
    return createToolBeforePolicyDecision({
      intent,
      status: "unsupported",
      reason: "tool call is outside the current sanctioned dispatch set",
      policySource: "tool-batch-dispatch",
      reportSafeSummary: call.argumentSummary,
      notProvenClaims: ["tool-dispatch-unsupported"],
    });
  }
  if (dispatchPolicy === "metadata-only") {
    return createToolBeforePolicyDecision({
      intent,
      status: "observe_only",
      reason:
        "tool batch dispatch is observation-only without an explicit boundary",
      policySource: "tool-batch-dispatch",
      reportSafeSummary: call.argumentSummary,
      notProvenClaims: ["tool-dispatch-not-run"],
    });
  }
  return createToolBeforePolicyDecision({
    intent,
    status: "allow",
    reason:
      dispatchPolicy === "parallel"
        ? "sanctioned read-only dispatch boundary required"
        : "sanctioned sequential dispatch boundary required",
    policySource: "tool-batch-dispatch",
    reportSafeSummary: call.argumentSummary,
    notProvenClaims: ["task-success", "verification-success"],
  });
}

export function statusFromPolicy(
  call: NormalizedToolCall,
  decision: ToolBeforePolicyDecision,
  dispatchPolicy: ToolBatchDispatchPlan["dispatchPolicy"],
  schedulingFacts?: ToolSchedulingCallFacts,
): ToolCallDispatchStatus {
  if (call.status === "malformed" || decision.status === "rejected") {
    return "blocked";
  }
  if (decision.status === "unsupported") {
    return "unsupported";
  }
  if (decision.status === "request_authority") {
    return "authority_required";
  }
  if (decision.status === "block") {
    return "blocked";
  }
  if (decision.status === "observe_only") {
    return "not_dispatched";
  }
  if (call.redaction.status === "redacted" || !call.reportSafeArguments) {
    return "not_dispatched";
  }
  if (dispatchPolicy === "parallel") {
    if (schedulingFacts?.decision === "authority_required") {
      return "authority_required";
    }
    if (schedulingFacts?.decision === "unsupported") {
      return "unsupported";
    }
    if (schedulingFacts?.decision === "blocked") {
      return "blocked";
    }
  }
  if (
    dispatchPolicy === "parallel" &&
    schedulingFacts?.decision !== "parallel_allowed" &&
    schedulingFacts?.decision !== "forced_sequential"
  ) {
    return "not_dispatched";
  }
  if (dispatchPolicy === "metadata-only") return "not_dispatched";
  return "dispatched";
}

export function authorityGrantStatus(
  decision: ToolBeforePolicyDecision,
  dispatchStatus: ToolCallDispatchStatus,
): ToolDispatchPlanCall["authorityGrantStatus"] {
  if (
    decision.authorityRequirement === "denied" ||
    decision.status === "block"
  ) {
    return "denied";
  }
  if (decision.status === "request_authority") {
    return "required";
  }
  if (dispatchStatus === "dispatched") {
    return "granted";
  }
  if (decision.authorityRequirement === "none-required") {
    return "not-required";
  }
  return "unknown";
}

export function notDispatchedReason(
  call: NormalizedToolCall,
  decision: ToolBeforePolicyDecision,
  dispatchStatus: ToolCallDispatchStatus,
  dispatchPolicy: ToolBatchDispatchPlan["dispatchPolicy"],
): string {
  if (dispatchPolicy === "metadata-only") {
    return "dispatch policy is metadata-only";
  }
  if (dispatchStatus === "blocked") {
    return decision.reason || "blocked by policy";
  }
  if (dispatchStatus === "authority_required") {
    return "explicit authority grant is required";
  }
  if (dispatchStatus === "unsupported") {
    return `tool '${call.name}' is unsupported`;
  }
  return "not selected for dispatch";
}

export function executionStateFromPlan(
  call: NormalizedToolCall,
  dispatchStatus: ToolCallDispatchStatus,
  dispatchPolicy?: "sequential" | "parallel" | "metadata-only",
): ToolExecutionState {
  if (call.status === "malformed") {
    return "malformed";
  }
  if (call.status === "unsupported" || call.kind === "unknown") {
    return "unsupported";
  }
  if (dispatchStatus === "blocked") {
    return "blocked";
  }
  if (dispatchStatus === "authority_required") {
    return "authority_required";
  }
  if (dispatchStatus === "dispatched" && dispatchPolicy !== "metadata-only") {
    return "scheduled";
  }
  return "not_dispatched";
}

export function summarizePlanStatus(
  calls: readonly ToolDispatchPlanCall[],
): ToolBatchDispatchStatus {
  if (calls.length === 0) {
    return "not_dispatched";
  }
  if (calls.every((call) => call.dispatchStatus === "dispatched")) {
    return "dispatched";
  }
  if (calls.some((call) => call.dispatchStatus === "dispatched")) {
    return "partially_dispatchable";
  }
  if (calls.some((call) => call.dispatchStatus === "authority_required")) {
    return "authority_required";
  }
  if (calls.some((call) => call.dispatchStatus === "blocked")) {
    return "blocked";
  }
  if (calls.some((call) => call.dispatchStatus === "unsupported")) {
    return "unsupported";
  }
  return "not_dispatched";
}
