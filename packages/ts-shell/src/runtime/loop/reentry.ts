import {
  createModelResponseBoundary,
  type ModelResponseBoundary,
} from "../../provider/response/boundary.js";
import type { ControlledModelInvocationAdapterProjection } from "../../provider/request/attempt.js";
import {
  accumulateAssistantResponse,
  type AssistantResponseState,
} from "../../turn/assistantResponse.js";
import {
  extractToolCallBatch,
  type NormalizedToolCallBatch,
} from "../../tools/toolCallBatch.js";
import {
  createToolBatchHandoff,
  prepareSafeToolBatchHandoff,
  type ToolBatchHandoffProjection,
} from "../../tools/toolHandoff.js";

export type ModelResponseReentryStatus =
  | "ready_for_boundary_processing"
  | "processed"
  | "blocked_by_redaction"
  | "blocked_by_invalid_output"
  | "blocked_by_insufficient_output"
  | "blocked_by_cancelled_attempt"
  | "blocked_by_failed_attempt"
  | "unsupported"
  | "not_ready";

export type ToolExtractionHandoffReadiness =
  | "ready_for_tool_handoff"
  | "blocked_by_invalid_calls"
  | "no_tool_calls"
  | "not_ready";

export type LoopCycleBoundaryStatus =
  | "tool_handoff_ready"
  | "no_tool_response_observed"
  | "partial_response"
  | "blocked_response"
  | "failed_response"
  | "cancelled_response"
  | "unsupported"
  | "not_ready";

export type LoopCycleNextHandoffKind =
  | "tool_batch"
  | "none"
  | "blocked"
  | "unsupported"
  | "not_ready";

export interface ModelResponseReentryFacts {
  readonly reentryId: string;
  readonly sourceAttemptId?: string;
  readonly sourceResponseHandoffId?: string;
  readonly responseClassification: string;
  readonly assistantContentAvailability: "available" | "absent" | "redacted";
  readonly toolExtractionReadiness: "ready" | "partial" | "no_tool_calls" | "not_ready";
  readonly redactionState: "report-safe" | "redacted";
  readonly rawOutputExcluded: true;
  readonly reentryStatus: ModelResponseReentryStatus;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface AssistantAccumulationFacts {
  readonly accumulationId: string;
  readonly sourceReentryId: string;
  readonly contentAvailability: "available" | "absent" | "redacted";
  readonly contentSummarySafeLabel: string;
  readonly contentRedactionState: "report-safe" | "redacted";
  readonly hiddenChannelExcluded: true;
  readonly completionStatus: AssistantResponseState["accumulationStatus"] | "blocked";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface ReenteredToolExtractionFacts {
  readonly extractionId: string;
  readonly sourceAssistantAccumulationId: string;
  readonly extractedCallIds: readonly string[];
  readonly malformedCallIds: readonly string[];
  readonly unsupportedCallIds: readonly string[];
  readonly unknownToolIds: readonly string[];
  readonly noToolStatus: "observed" | "not_observed" | "blocked";
  readonly extractionConfidence: "exact" | "partial" | "none";
  readonly handoffReadiness: ToolExtractionHandoffReadiness;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface LoopCycleBoundaryFacts {
  readonly cycleId: string;
  readonly sourceInvocationAttemptId?: string;
  readonly responseReentryId: string;
  readonly assistantAccumulationId?: string;
  readonly toolExtractionId?: string;
  readonly nextHandoffKind: LoopCycleNextHandoffKind;
  readonly cycleStatus: LoopCycleBoundaryStatus;
  readonly stopReason?: string;
  readonly continuationRequirement:
    | "tool_handoff_required"
    | "no_automatic_continuation"
    | "blocked_response"
    | "unsupported"
    | "not_ready";
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface ModelResponseReentryCycleProjection {
  readonly cycleId: string;
  readonly responseReentry: ModelResponseReentryFacts;
  readonly responseBoundary: ModelResponseBoundary;
  readonly assistantResponse?: AssistantResponseState;
  readonly assistantAccumulation?: AssistantAccumulationFacts;
  readonly toolCallBatch?: NormalizedToolCallBatch;
  readonly toolBatchHandoff?: ToolBatchHandoffProjection;
  readonly toolExtraction?: ReenteredToolExtractionFacts;
  readonly cycleBoundary: LoopCycleBoundaryFacts;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectModelResponseReentryCycle(input: {
  readonly cycleId?: string;
  readonly controlledInvocation: ControlledModelInvocationAdapterProjection;
  readonly responseBoundary?: ModelResponseBoundary;
  readonly toolCallCandidates?: readonly unknown[];
  readonly notProvenClaims?: readonly string[];
}): ModelResponseReentryCycleProjection {
  const handoff = input.controlledInvocation.responseHandoff;
  const responseBoundary = input.responseBoundary ??
    input.controlledInvocation.modelResponseBoundary ??
    createModelResponseBoundary({
      responseId: handoff?.modelResponseBoundaryId ??
        input.controlledInvocation.outcome.responseHandoffId ??
        input.controlledInvocation.attemptId ??
        input.controlledInvocation.adapterId,
      providerMode: input.controlledInvocation.invocationMode === "controlled_provider_fetch"
        ? "real"
        : "default",
      providerSafeLabel: input.controlledInvocation.providerSafeLabel,
      modelSafeLabel: input.controlledInvocation.modelSafeLabel,
      source: "unavailable",
      status: "unavailable",
      notProvenClaims: input.controlledInvocation.notProvenClaims,
    });
  const cycleId = sanitizeId(input.cycleId ?? `model-response-cycle:${responseBoundary.responseId}`);
  const reentryStatus = classifyReentryStatus(input.controlledInvocation, responseBoundary);
  const reentryId = sanitizeId(`${cycleId}:response-reentry`);
  const baseClaims = unique([
    "response-handoff-is-not-final-assistant-success",
    "reentry-processed-is-not-task-success",
    "assistant-accumulated-is-not-task-success",
    "tool-extracted-is-not-tool-executed",
    "no-tool-response-is-not-task-completion",
    "cycle-boundary-is-not-terminal-success",
    "product-surface-is-not-success",
    "terminal-success",
    ...input.controlledInvocation.notProvenClaims,
    ...input.controlledInvocation.outcome.notProvenClaims,
    ...(handoff?.notProvenClaims ?? []),
    ...responseBoundary.notProvenClaims,
    ...(input.notProvenClaims ?? []),
  ]);
  const responseReentry: ModelResponseReentryFacts = freeze({
    reentryId,
    ...(input.controlledInvocation.attemptId
      ? { sourceAttemptId: sanitizeId(input.controlledInvocation.attemptId) }
      : {}),
    ...(handoff ? { sourceResponseHandoffId: sanitizeId(handoff.responseHandoffId) } : {}),
    responseClassification: handoff?.responseClassification ?? input.controlledInvocation.outcome.status,
    assistantContentAvailability: handoff?.assistantContentAvailability ?? "absent",
    toolExtractionReadiness: handoff?.toolCallExtractionReadiness ?? "not_ready",
    redactionState: handoff?.redactionStatus ??
      (responseBoundary.redaction.status === "redacted" ? "redacted" : "report-safe"),
    rawOutputExcluded: true,
    reentryStatus,
    terminalSuccessClaim: false,
    notProvenClaims: baseClaims,
  });

  if (reentryStatus !== "processed" && reentryStatus !== "ready_for_boundary_processing") {
    const cycleBoundary = blockedCycleBoundary({
      cycleId,
      responseReentry,
      controlledInvocation: input.controlledInvocation,
      status: cycleStatusForBlockedReentry(reentryStatus),
      notProvenClaims: baseClaims,
    });
    return freeze({
      cycleId,
      responseReentry,
      responseBoundary,
      cycleBoundary,
      terminalSuccessClaim: false,
      notProvenClaims: unique([...baseClaims, ...cycleBoundary.notProvenClaims]),
    });
  }

  const candidates = input.toolCallCandidates ??
    input.controlledInvocation.responseHandoff?.reportSafeToolCallCandidates ??
    [];
  const assistantResponse = accumulateAssistantResponse({
    responseBoundary,
    chunks: [{
      textDelta: responseBoundary.assistantContentSummary === "empty"
        ? undefined
        : responseBoundary.assistantContentSummary,
      toolCalls: candidates,
    }],
    notProvenClaims: baseClaims,
  });
  const assistantAccumulation: AssistantAccumulationFacts = freeze({
    accumulationId: sanitizeId(`${reentryId}:assistant-accumulation`),
    sourceReentryId: reentryId,
    contentAvailability: assistantResponse.accumulationStatus === "redacted"
      ? "redacted"
      : assistantResponse.contentSummary === "empty" ? "absent" : "available",
    contentSummarySafeLabel: assistantResponse.contentSummary === "empty"
      ? "empty"
      : "report-safe-summary-present",
    contentRedactionState: assistantResponse.redaction.status,
    hiddenChannelExcluded: true,
    completionStatus: assistantResponse.accumulationStatus,
    terminalSuccessClaim: false,
    notProvenClaims: unique([...baseClaims, ...assistantResponse.notProvenClaims]),
  });
  const toolCallBatch = extractToolCallBatch({
    responseBoundary,
    assistantResponse,
    batchId: `${cycleId}:tool-call-batch`,
    notProvenClaims: assistantAccumulation.notProvenClaims,
  });
  const preparedHandoff = prepareSafeToolBatchHandoff({
    responseBoundary,
    assistantResponse,
    toolCallBatch,
    caller: "model-response-reentry",
  });
  const toolBatchHandoff = createToolBatchHandoff({
    responseBoundary,
    assistantResponse,
    toolCallBatch,
    dispatchPlan: preparedHandoff.dispatchPlan,
    resultDetails: preparedHandoff.resultDetails,
    notProvenClaims: baseClaims,
  });
  const toolExtraction = toolExtractionFacts({
    cycleId,
    assistantAccumulation,
    toolCallBatch,
    toolBatchHandoff,
    notProvenClaims: baseClaims,
  });
  const cycleBoundary = cycleBoundaryFacts({
    cycleId,
    responseReentry,
    assistantAccumulation,
    toolExtraction,
    controlledInvocation: input.controlledInvocation,
    notProvenClaims: unique([
      ...baseClaims,
      ...assistantResponse.notProvenClaims,
      ...toolCallBatch.notProvenClaims,
      ...toolBatchHandoff.notProvenClaims,
      ...toolExtraction.notProvenClaims,
    ]),
  });

  return freeze({
    cycleId,
    responseReentry: { ...responseReentry, reentryStatus: "processed" },
    responseBoundary,
    assistantResponse,
    assistantAccumulation,
    toolCallBatch,
    toolBatchHandoff,
    toolExtraction,
    cycleBoundary,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      ...baseClaims,
      ...assistantResponse.notProvenClaims,
      ...assistantAccumulation.notProvenClaims,
      ...toolCallBatch.notProvenClaims,
      ...toolBatchHandoff.notProvenClaims,
      ...toolExtraction.notProvenClaims,
      ...cycleBoundary.notProvenClaims,
    ]),
  });
}

function classifyReentryStatus(
  invocation: ControlledModelInvocationAdapterProjection,
  responseBoundary: ModelResponseBoundary,
): ModelResponseReentryStatus {
  const handoff = invocation.responseHandoff;
  if (!handoff || !invocation.attemptId) {
    return "not_ready";
  }
  if (invocation.outcome.status === "cancelled" || handoff.responseClassification === "cancelled") {
    return "blocked_by_cancelled_attempt";
  }
  if (invocation.outcome.status === "unsupported" || handoff.responseClassification === "unsupported") {
    return "unsupported";
  }
  if (
    invocation.outcome.status === "redaction_failed" ||
    handoff.responseClassification === "redaction_failed" ||
    handoff.redactionStatus === "redacted" ||
    responseBoundary.redaction.status === "redacted"
  ) {
    return "blocked_by_redaction";
  }
  if (invocation.outcome.status === "output_invalid" || handoff.responseClassification === "output_invalid") {
    return "blocked_by_invalid_output";
  }
  if (
    invocation.outcome.status === "output_insufficient" ||
    handoff.responseClassification === "output_insufficient" ||
    (handoff.assistantContentAvailability === "absent" &&
      handoff.toolCallExtractionReadiness === "no_tool_calls")
  ) {
    return "blocked_by_insufficient_output";
  }
  if (invocation.outcome.status !== "completed" || handoff.responseClassification === "failed") {
    return "blocked_by_failed_attempt";
  }
  if (responseBoundary.status === "failed") {
    return "blocked_by_invalid_output";
  }
  if (responseBoundary.status === "aborted") {
    return "blocked_by_cancelled_attempt";
  }
  if (responseBoundary.status === "unavailable") {
    return "not_ready";
  }
  return "processed";
}

function toolExtractionFacts(input: {
  readonly cycleId: string;
  readonly assistantAccumulation: AssistantAccumulationFacts;
  readonly toolCallBatch: NormalizedToolCallBatch;
  readonly toolBatchHandoff: ToolBatchHandoffProjection;
  readonly notProvenClaims: readonly string[];
}): ReenteredToolExtractionFacts {
  const extractedCallIds = input.toolCallBatch.calls.map((call) => call.id);
  const malformedCallIds = input.toolCallBatch.calls
    .filter((call) => call.status === "malformed")
    .map((call) => call.id);
  const unsupportedCallIds = input.toolCallBatch.calls
    .filter((call) => call.status === "unsupported")
    .map((call) => call.id);
  const unknownToolIds = input.toolCallBatch.calls
    .filter((call) => call.status === "unknown")
    .map((call) => call.id);
  const handoffReadiness: ToolExtractionHandoffReadiness = input.toolCallBatch.calls.length === 0
    ? "no_tool_calls"
    : input.toolCallBatch.extractionStatus === "failed"
      ? "blocked_by_invalid_calls"
      : "ready_for_tool_handoff";
  const extractionConfidence: ReenteredToolExtractionFacts["extractionConfidence"] =
    input.toolCallBatch.extractionStatus === "extracted"
      ? "exact"
      : input.toolCallBatch.extractionStatus === "partial"
        ? "partial"
        : "none";

  return freeze({
    extractionId: sanitizeId(`${input.cycleId}:tool-extraction`),
    sourceAssistantAccumulationId: input.assistantAccumulation.accumulationId,
    extractedCallIds: freeze(extractedCallIds.map(sanitizeId)),
    malformedCallIds: freeze(malformedCallIds.map(sanitizeId)),
    unsupportedCallIds: freeze(unsupportedCallIds.map(sanitizeId)),
    unknownToolIds: freeze(unknownToolIds.map(sanitizeId)),
    noToolStatus: input.toolCallBatch.calls.length === 0 ? "observed" : "not_observed",
    extractionConfidence,
    handoffReadiness,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "tool-extracted-is-not-tool-executed",
      "no-tool-response-is-not-task-completion",
      "terminal-success",
      ...input.notProvenClaims,
      ...input.toolCallBatch.notProvenClaims,
      ...input.toolBatchHandoff.notProvenClaims,
    ]),
  });
}

function cycleBoundaryFacts(input: {
  readonly cycleId: string;
  readonly responseReentry: ModelResponseReentryFacts;
  readonly assistantAccumulation: AssistantAccumulationFacts;
  readonly toolExtraction: ReenteredToolExtractionFacts;
  readonly controlledInvocation: ControlledModelInvocationAdapterProjection;
  readonly notProvenClaims: readonly string[];
}): LoopCycleBoundaryFacts {
  const cycleStatus: LoopCycleBoundaryStatus = input.toolExtraction.handoffReadiness === "ready_for_tool_handoff"
    ? input.toolExtraction.extractionConfidence === "partial" ? "partial_response" : "tool_handoff_ready"
    : input.toolExtraction.handoffReadiness === "no_tool_calls"
      ? "no_tool_response_observed"
      : "partial_response";
  const nextHandoffKind: LoopCycleNextHandoffKind = cycleStatus === "tool_handoff_ready" ||
      cycleStatus === "partial_response"
    ? input.toolExtraction.extractedCallIds.length > 0 ? "tool_batch" : "none"
    : "none";

  return freeze({
    cycleId: sanitizeId(input.cycleId),
    ...(input.controlledInvocation.attemptId
      ? { sourceInvocationAttemptId: sanitizeId(input.controlledInvocation.attemptId) }
      : {}),
    responseReentryId: input.responseReentry.reentryId,
    assistantAccumulationId: input.assistantAccumulation.accumulationId,
    toolExtractionId: input.toolExtraction.extractionId,
    nextHandoffKind,
    cycleStatus,
    stopReason: cycleStatus === "no_tool_response_observed"
      ? "no-tool-response-observed"
      : "manual-continuation-required",
    continuationRequirement: cycleStatus === "tool_handoff_ready" || nextHandoffKind === "tool_batch"
      ? "tool_handoff_required"
      : "no_automatic_continuation",
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "cycle-boundary-is-not-terminal-success",
      "model-response-complete-is-not-task-success",
      "terminal-success",
      ...input.notProvenClaims,
    ]),
  });
}

function blockedCycleBoundary(input: {
  readonly cycleId: string;
  readonly responseReentry: ModelResponseReentryFacts;
  readonly controlledInvocation: ControlledModelInvocationAdapterProjection;
  readonly status: LoopCycleBoundaryStatus;
  readonly notProvenClaims: readonly string[];
}): LoopCycleBoundaryFacts {
  const nextHandoffKind: LoopCycleNextHandoffKind = input.status === "unsupported"
    ? "unsupported"
    : input.status === "not_ready" ? "not_ready" : "blocked";
  return freeze({
    cycleId: sanitizeId(input.cycleId),
    ...(input.controlledInvocation.attemptId
      ? { sourceInvocationAttemptId: sanitizeId(input.controlledInvocation.attemptId) }
      : {}),
    responseReentryId: input.responseReentry.reentryId,
    nextHandoffKind,
    cycleStatus: input.status,
    stopReason: input.responseReentry.reentryStatus,
    continuationRequirement: input.status === "unsupported"
      ? "unsupported"
      : input.status === "not_ready" ? "not_ready" : "blocked_response",
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "cycle-boundary-is-not-terminal-success",
      "blocked-response-is-not-task-success",
      "terminal-success",
      ...input.notProvenClaims,
    ]),
  });
}

function cycleStatusForBlockedReentry(status: ModelResponseReentryStatus): LoopCycleBoundaryStatus {
  switch (status) {
    case "blocked_by_cancelled_attempt":
      return "cancelled_response";
    case "blocked_by_failed_attempt":
      return "failed_response";
    case "unsupported":
      return "unsupported";
    case "not_ready":
      return "not_ready";
    case "blocked_by_redaction":
    case "blocked_by_invalid_output":
    case "blocked_by_insufficient_output":
    case "ready_for_boundary_processing":
    case "processed":
      return "blocked_response";
  }
}

function sanitizeId(value: string): string {
  return sanitizeText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider-config=[redacted]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [secret-redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[secret-redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .trim()
    .slice(0, maxLength);
}

function unique(values: readonly string[]): readonly string[] {
  return freeze(Array.from(new Set(values.map((value) => sanitizeText(value, 160)))));
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}
