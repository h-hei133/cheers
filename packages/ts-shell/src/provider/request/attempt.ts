import type { ModelRequest, NormalizedProviderError } from "../../model-adapters/types.js";
import {
  classifyProviderFailure,
  type ProviderFailureClass,
} from "../registry/provider.js";
import {
  providerFetchOutcomeToStreamEvents,
  type ProviderStreamFetchOutcome,
} from "../response/adapter.js";
import {
  createModelResponseBoundary,
  type ModelResponseBoundary,
} from "../response/boundary.js";
import type { ProviderResponseStreamEvent } from "../response/stream.js";
import type { NextTurnModelRequestPreparation } from "./boundary.js";
import {
  createModelInvocationAttemptEnvelope,
  type ModelInvocationAttemptEnvelope,
  type ModelInvocationFallbackEligibility,
  type ModelInvocationGateFacts,
  type ModelInvocationMode,
  type ModelInvocationRetryEligibility,
} from "./invocation.js";

export type ControlledInvocationAttemptDecision =
  | "not_attempted"
  | "blocked"
  | "execute_via_provider_fetch";

export type ControlledInvocationOutcomeStatus =
  | "not_attempted"
  | "blocked"
  | "attempted"
  | "completed"
  | "failed"
  | "cancelled"
  | "output_invalid"
  | "output_insufficient"
  | "redaction_failed"
  | "unsupported";

export type ProviderResponseHandoffClassification =
  | "completed"
  | "failed"
  | "cancelled"
  | "output_invalid"
  | "output_insufficient"
  | "redaction_failed"
  | "unsupported";

export type ProviderResponseAssistantContentAvailability =
  | "available"
  | "absent"
  | "redacted";

export type ProviderResponseToolCallExtractionReadiness =
  | "ready"
  | "partial"
  | "no_tool_calls"
  | "not_ready";

export type ControlledModelInvocationExecutor = (
  request: ModelRequest,
  signal?: AbortSignal,
) => Promise<ProviderStreamFetchOutcome> | ProviderStreamFetchOutcome;

export interface ControlledModelInvocationAdapterInput {
  readonly adapterId?: string;
  readonly requestPreparation: NextTurnModelRequestPreparation;
  readonly gate: ModelInvocationGateFacts;
  readonly invocationMode?: ModelInvocationMode;
  readonly executor?: ControlledModelInvocationExecutor;
  readonly request?: ModelRequest;
  readonly responseId?: string;
  readonly turnId?: string;
  readonly signal?: AbortSignal;
  readonly notProvenClaims?: readonly string[];
}

export interface ControlledModelInvocationOutcomeFacts {
  readonly attemptId?: string;
  readonly sourceGateId: string;
  readonly providerSafeLabel: string;
  readonly modelSafeLabel: string;
  readonly status: ControlledInvocationOutcomeStatus;
  readonly failureClass?: ProviderFailureClass;
  readonly retryEligibility: ModelInvocationRetryEligibility;
  readonly fallbackEligibility: ModelInvocationFallbackEligibility;
  readonly fallbackAttempted: false;
  readonly responseHandoffId?: string;
  readonly redactionState: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ProviderResponseHandoffFacts {
  readonly responseHandoffId: string;
  readonly sourceAttemptId: string;
  readonly responseClassification: ProviderResponseHandoffClassification;
  readonly assistantContentAvailability: ProviderResponseAssistantContentAvailability;
  readonly toolCallExtractionReadiness: ProviderResponseToolCallExtractionReadiness;
  readonly modelResponseBoundaryId?: string;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly rawOutputExcluded: true;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ControlledModelInvocationAdapterProjection {
  readonly adapterId: string;
  readonly sourceGateId: string;
  readonly sourcePreparedRequestId: string;
  readonly providerSafeLabel: string;
  readonly modelSafeLabel: string;
  readonly invocationMode: ModelInvocationMode;
  readonly controlledOptInState: ModelInvocationGateFacts["optInState"];
  readonly attemptDecision: ControlledInvocationAttemptDecision;
  readonly attemptId?: string;
  readonly blockedReason?: string;
  readonly redactionState: "report-safe" | "redacted";
  readonly outcome: ControlledModelInvocationOutcomeFacts;
  readonly responseHandoff?: ProviderResponseHandoffFacts;
  readonly modelResponseBoundary?: ModelResponseBoundary;
  readonly attemptEnvelope: ModelInvocationAttemptEnvelope;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "full-transcript",
  "unsafe-file-contents",
] as const;

export async function runControlledModelInvocationAdapter(
  input: ControlledModelInvocationAdapterInput,
): Promise<ControlledModelInvocationAdapterProjection> {
  const redactions = new Set<string>();
  const adapterId = sanitizeText(
    input.adapterId ?? `controlled-model-invocation:${input.gate.gateId}`,
    redactions,
  );
  const invocationMode = input.invocationMode ?? "metadata_only";
  const base = {
    adapterId,
    sourceGateId: sanitizeText(input.gate.gateId, redactions),
    sourcePreparedRequestId: sanitizeText(input.gate.sourcePreparedRequestId, redactions),
    providerSafeLabel: sanitizeText(input.gate.providerSafeLabel, redactions),
    modelSafeLabel: sanitizeText(input.gate.modelSafeLabel, redactions),
    invocationMode,
    controlledOptInState: input.gate.optInState,
    redactionState: redactions.size > 0 || input.gate.redactionState === "redacted"
      ? "redacted" as const
      : "report-safe" as const,
  };
  const notProvenClaims = unique([
    "attempt-is-not-provider-success",
    "completed-provider-fact-is-not-task-success",
    "response-handoff-is-not-final-assistant-success",
    "tool-extraction-readiness-is-not-tool-execution",
    "retry-eligibility-is-not-retry-execution",
    "fallback-eligible-is-not-fallback-executed",
    "product-surface-rendered-is-not-success",
    "terminal-success",
    ...input.gate.notProvenClaims,
    ...(input.notProvenClaims ?? []),
  ]);

  const blockedReason = adapterBlockedReason(input, invocationMode);
  if (blockedReason) {
    const status = blockedReason === "controlled-invocation-mode-not-selected" ||
        blockedReason === "provider-executor-not-supplied"
      ? "not_attempted"
      : input.gate.eligibilityStatus === "unsupported"
        ? "unsupported"
        : "blocked";
    const failureClass = failureClassForBlockedReason(input.gate, blockedReason);
    const outcome = createOutcome({
      gate: input.gate,
      status,
      failureClass,
      redactionState: base.redactionState,
      notProvenClaims,
    });
    const attemptEnvelope = createModelInvocationAttemptEnvelope({
      gate: input.gate,
      invocationMode,
      observedStatus: status === "not_attempted" ? "not_attempted" : "blocked",
      failureClass,
      notProvenClaims,
    });
    return deepFreeze({
      ...base,
      attemptDecision: status === "not_attempted" ? "not_attempted" : "blocked",
      blockedReason: sanitizeText(blockedReason, redactions),
      outcome,
      attemptEnvelope,
      notProvenClaims,
      terminalSuccessClaim: false,
    });
  }

  const attemptId = sanitizeText(
    `controlled-model-invocation-attempt:${input.gate.gateId}`,
    redactions,
  );
  try {
    const request = input.request ?? buildModelRequest(input.requestPreparation, redactions);
    const outcome = await input.executor!(request, input.signal);
    const streamEvents = await providerFetchOutcomeToStreamEvents({
      requestId: input.requestPreparation.modelRequestBoundaryId,
      responseId: input.responseId ?? `${attemptId}:response`,
      turnId: input.turnId,
      outcome,
    });
    const classified = classifyStreamEvents(streamEvents);
    const handoff = createResponseHandoff({
      attemptId,
      gate: input.gate,
      streamEvents,
      classification: classified.classification,
      failureClass: classified.failureClass,
      responseId: input.responseId ?? `${attemptId}:response`,
      redactions,
      notProvenClaims,
    });
    const responseBoundary = createModelResponseBoundary({
      responseId: handoff.responseHandoff.modelResponseBoundaryId ?? `${attemptId}:response`,
      turnId: input.turnId,
      providerMode: "real",
      providerSafeLabel: input.gate.providerSafeLabel,
      modelSafeLabel: input.gate.modelSafeLabel,
      source: "existing_safe_projection",
      status: classified.status === "completed" ? "observed" : "failed",
      assistantContent: streamEvents
        .map((event) => event.contentDelta)
        .filter((value): value is string => Boolean(value))
        .join(" "),
      toolCallCount: streamEvents.filter((event) => event.kind === "tool_call_completed").length,
      notProvenClaims,
    });
    const outcomeFacts = createOutcome({
      gate: input.gate,
      attemptId,
      status: classified.status,
      failureClass: classified.failureClass,
      responseHandoffId: handoff.responseHandoff.responseHandoffId,
      redactionState: handoff.responseHandoff.redactionStatus,
      notProvenClaims,
    });
    const attemptEnvelope = createModelInvocationAttemptEnvelope({
      gate: input.gate,
      attemptId,
      invocationMode,
      observedStatus: classified.status === "completed" ? "completed" : "failed",
      failureClass: classified.failureClass,
      notProvenClaims,
    });

    return deepFreeze({
      ...base,
      attemptDecision: "execute_via_provider_fetch",
      attemptId,
      outcome: outcomeFacts,
      responseHandoff: handoff.responseHandoff,
      modelResponseBoundary: responseBoundary,
      attemptEnvelope,
      notProvenClaims,
      terminalSuccessClaim: false,
    });
  } catch (error) {
    const failureClass = input.signal?.aborted
      ? "provider_cancelled"
      : classifyProviderAttemptError(error);
    const status = statusForFailureClass(failureClass);
    const outcome = createOutcome({
      gate: input.gate,
      attemptId,
      status,
      failureClass,
      redactionState: base.redactionState,
      notProvenClaims,
    });
    const attemptEnvelope = createModelInvocationAttemptEnvelope({
      gate: input.gate,
      attemptId,
      invocationMode,
      observedStatus: status === "cancelled" ? "cancelled" : "failed",
      failureClass,
      notProvenClaims,
    });

    return deepFreeze({
      ...base,
      attemptDecision: "execute_via_provider_fetch",
      attemptId,
      outcome,
      attemptEnvelope,
      notProvenClaims,
      terminalSuccessClaim: false,
    });
  }
}

function adapterBlockedReason(
  input: ControlledModelInvocationAdapterInput,
  invocationMode: ModelInvocationMode,
): string | undefined {
  if (input.signal?.aborted) {
    return "invocation-cancelled-before-attempt";
  }
  if (input.gate.eligibilityStatus !== "eligible_for_explicit_invocation") {
    return `gate:${input.gate.eligibilityStatus}`;
  }
  if (invocationMode !== "controlled_provider_fetch") {
    return "controlled-invocation-mode-not-selected";
  }
  if (!input.executor) {
    return "provider-executor-not-supplied";
  }
  return undefined;
}

function buildModelRequest(
  preparation: NextTurnModelRequestPreparation,
  redactions: Set<string>,
): ModelRequest {
  return {
    schemaVersion: "1.0.0" as ModelRequest["schemaVersion"],
    model: sanitizeText(preparation.providerMetadata.modelSafeLabel, redactions),
    messages: preparation.safeRequestMessages.map((message) => ({
      role: message.source === "tool-result" ? "tool" : "user",
      content: sanitizeText(message.safeSummary, redactions),
      ...(message.source === "tool-result" ? { toolCallId: message.messageId } : {}),
    })),
  };
}

function classifyStreamEvents(events: readonly ProviderResponseStreamEvent[]): {
  readonly status: ControlledInvocationOutcomeStatus;
  readonly classification: ProviderResponseHandoffClassification;
  readonly failureClass?: ProviderFailureClass;
} {
  const failure = events.find((event) => event.failureClass);
  const kinds = new Set(events.map((event) => event.kind));
  if (failure?.failureClass) {
    const status = statusForFailureClass(failure.failureClass);
    return {
      status,
      classification: classificationForStatus(status),
      failureClass: failure.failureClass,
    };
  }
  if (kinds.has("redaction_failed")) {
    return {
      status: "redaction_failed",
      classification: "redaction_failed",
      failureClass: "provider_redaction_failure",
    };
  }
  if (kinds.has("output_invalid")) {
    return {
      status: "output_invalid",
      classification: "output_invalid",
      failureClass: "provider_output_invalid",
    };
  }
  if (kinds.has("output_insufficient")) {
    return {
      status: "output_insufficient",
      classification: "output_insufficient",
      failureClass: "provider_output_insufficient",
    };
  }
  if (kinds.has("stream_cancelled")) {
    return {
      status: "cancelled",
      classification: "cancelled",
      failureClass: "provider_cancelled",
    };
  }
  if (kinds.has("stream_failed")) {
    return {
      status: "failed",
      classification: "failed",
      failureClass: "provider_unknown",
    };
  }
  return {
    status: "completed",
    classification: "completed",
  };
}

function createResponseHandoff(input: {
  readonly attemptId: string;
  readonly gate: ModelInvocationGateFacts;
  readonly streamEvents: readonly ProviderResponseStreamEvent[];
  readonly classification: ProviderResponseHandoffClassification;
  readonly failureClass?: ProviderFailureClass;
  readonly responseId: string;
  readonly redactions: Set<string>;
  readonly notProvenClaims: readonly string[];
}): {
  readonly responseHandoff: ProviderResponseHandoffFacts;
} {
  const hasContent = input.streamEvents.some((event) => Boolean(event.contentDelta));
  const completedToolCalls = input.streamEvents.filter((event) =>
    event.kind === "tool_call_completed"
  ).length;
  const partialToolCalls = input.streamEvents.some((event) => event.kind === "tool_call_delta");
  const redacted = input.redactions.size > 0 ||
    input.classification === "redaction_failed" ||
    input.failureClass === "provider_redaction_failure";
  const responseHandoffId = sanitizeText(
    `provider-response-handoff:${input.attemptId}`,
    input.redactions,
  );

  return {
    responseHandoff: deepFreeze({
      responseHandoffId,
      sourceAttemptId: sanitizeText(input.attemptId, input.redactions),
      responseClassification: input.classification,
      assistantContentAvailability: redacted
        ? "redacted"
        : hasContent ? "available" : "absent",
      toolCallExtractionReadiness: completedToolCalls > 0
        ? "ready"
        : partialToolCalls ? "partial" : "no_tool_calls",
      modelResponseBoundaryId: sanitizeText(input.responseId, input.redactions),
      redactionStatus: redacted ? "redacted" : "report-safe",
      rawOutputExcluded: true,
      notProvenClaims: unique([
        "response-handoff-is-not-final-assistant-success",
        "tool-extraction-readiness-is-not-tool-execution",
        "completed-provider-fact-is-not-task-success",
        ...input.notProvenClaims,
      ]),
      terminalSuccessClaim: false,
    }),
  };
}

function createOutcome(input: {
  readonly gate: ModelInvocationGateFacts;
  readonly attemptId?: string;
  readonly status: ControlledInvocationOutcomeStatus;
  readonly failureClass?: ProviderFailureClass;
  readonly responseHandoffId?: string;
  readonly redactionState: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
}): ControlledModelInvocationOutcomeFacts {
  return deepFreeze({
    ...(input.attemptId ? { attemptId: input.attemptId } : {}),
    sourceGateId: input.gate.gateId,
    providerSafeLabel: input.gate.providerSafeLabel,
    modelSafeLabel: input.gate.modelSafeLabel,
    status: input.status,
    ...(input.failureClass ? { failureClass: input.failureClass } : {}),
    retryEligibility: input.gate.retryEligibility,
    fallbackEligibility: input.gate.fallbackEligibility,
    fallbackAttempted: false,
    ...(input.responseHandoffId ? { responseHandoffId: input.responseHandoffId } : {}),
    redactionState: input.redactionState,
    notProvenClaims: input.notProvenClaims,
    terminalSuccessClaim: false,
  });
}

function failureClassForBlockedReason(
  gate: ModelInvocationGateFacts,
  blockedReason: string,
): ProviderFailureClass | undefined {
  if (blockedReason === "controlled-invocation-mode-not-selected" ||
    blockedReason === "provider-executor-not-supplied") {
    return undefined;
  }
  switch (gate.eligibilityStatus) {
    case "blocked_by_auth":
      return "provider_auth";
    case "blocked_by_provider_unavailable":
      return "provider_network";
    case "blocked_by_redaction":
      return "provider_redaction_failure";
    case "unsupported":
      return "provider_config";
    case "blocked_by_missing_opt_in":
    case "blocked_by_policy":
    case "blocked_by_request_not_ready":
    case "not_ready":
      return "provider_config";
    case "eligible_for_explicit_invocation":
      return undefined;
  }
}

function classifyProviderAttemptError(error: unknown): ProviderFailureClass {
  if (isNormalizedProviderError(error)) {
    switch (error.kind) {
      case "authentication":
        return "provider_auth";
      case "invalid_request":
        return error.statusCode === 408 ? "provider_timeout" : "provider_config";
      case "network":
        return "provider_network";
      case "rate_limit":
        return "provider_rate_limited";
      case "server":
        return "provider_endpoint";
      case "unknown":
        return classifyProviderFailure({
          status: error.statusCode,
          message: error.message,
          errorName: error.code,
        });
    }
  }
  if (error instanceof Error) {
    return classifyProviderFailure({
      errorName: error.name,
      message: error.message,
    });
  }
  return classifyProviderFailure({ message: String(error) });
}

function isNormalizedProviderError(error: unknown): error is NormalizedProviderError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "provider" in error &&
      "kind" in error &&
      "message" in error &&
      "retriable" in error,
  );
}

function statusForFailureClass(failureClass: ProviderFailureClass): ControlledInvocationOutcomeStatus {
  switch (failureClass) {
    case "provider_cancelled":
      return "cancelled";
    case "provider_output_invalid":
    case "provider_stream_event_malformed":
    case "provider_stream_protocol_error":
      return "output_invalid";
    case "provider_output_insufficient":
      return "output_insufficient";
    case "provider_redaction_failure":
      return "redaction_failed";
    case "provider_config":
    case "provider_auth":
    case "provider_network":
    case "provider_endpoint":
    case "provider_rate_limited":
    case "provider_timeout":
    case "provider_fallback_eligible":
    case "provider_fallback_ineligible":
    case "provider_unknown":
      return "failed";
    default:
      return "failed";
  }
}

function classificationForStatus(
  status: ControlledInvocationOutcomeStatus,
): ProviderResponseHandoffClassification {
  switch (status) {
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "output_invalid":
      return "output_invalid";
    case "output_insufficient":
      return "output_insufficient";
    case "redaction_failed":
      return "redaction_failed";
    case "unsupported":
      return "unsupported";
    case "not_attempted":
    case "blocked":
    case "attempted":
    case "failed":
      return "failed";
  }
}

function sanitizeText(input: string, redactions: Set<string>): string {
  const before = input;
  let value = input.trim();
  value = value.replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]");
  value = value.replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]");
  value = value.replace(/\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Authorization: Bearer [secret-redacted]");
  value = value.replace(/\b(?:Bearer|token|api[_-]?key|secret)\s*[:=]?\s*[A-Za-z0-9._~+/-]+/gi, "[secret-redacted]");
  value = value.replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]");
  value = value.replace(/\boldText\s*[:=]\s*[^\n\r]*/gi, "oldText=[raw-content-excluded]");
  value = value.replace(/\bnewText\s*[:=]\s*[^\n\r]*/gi, "newText=[raw-content-excluded]");
  value = value.replace(/\braw provider output\s*[:=]\s*[^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]");
  value = value.replace(/\bhidden reasoning[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/<[^>]+>/g, "[raw-content-excluded]");
  if (value !== before) {
    redactions.add("unsafe-controlled-invocation-input");
  }
  return value.length > 0 ? value.slice(0, 180) : "redacted-empty";
}

function unique(input: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(input)]);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

export const CONTROLLED_INVOCATION_REDACTION_EXCLUSIONS = REDACTION_EXCLUSIONS;
