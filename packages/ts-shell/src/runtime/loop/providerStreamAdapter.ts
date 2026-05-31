import type { ModelRequest, NormalizedProviderError } from "../../model-adapters/types.js";
import {
  classifyProviderFailure,
  type ProviderFailureClass,
} from "../../provider/registry/provider.js";
import type { ModelRequestBoundary } from "../../provider/request/boundary.js";
import {
  providerFetchOutcomeToStreamEvents,
  type ProviderStreamFetchOutcome,
} from "../../provider/response/adapter.js";
import type { ProviderResponseStreamEvent } from "../../provider/response/stream.js";
import {
  projectModelBoundaryPhase,
  type ModelBoundaryPhaseProjection,
} from "./modelBoundary.js";

export type ProviderStreamAdapterStatus =
  | "not_run"
  | "blocked"
  | "projected";

export type ProviderStreamReadinessStatus =
  | "ready"
  | "missing_config"
  | "missing_auth"
  | "auth_failed"
  | "network_failed"
  | "blocked"
  | "unknown";

export type ProviderLiveAttemptClassification =
  | "live_completed"
  | "live_partial"
  | "provider_blocked"
  | "config_failed"
  | "auth_failed"
  | "network_failed"
  | "endpoint_failed"
  | "rate_limited"
  | "timeout"
  | "cancelled"
  | "output_invalid"
  | "output_insufficient"
  | "redaction_failed"
  | "unsupported"
  | "unknown_failed";

export type ProviderRetryEligibility =
  | "retry_eligible"
  | "retry_not_allowed";

export type ProviderFallbackEligibility =
  | "fallback_eligible"
  | "fallback_not_eligible";

export type ProviderFallbackStatus = "fallback_not_attempted";

export type ProviderRecoveryFact =
  | ProviderRetryEligibility
  | ProviderFallbackEligibility
  | ProviderFallbackStatus
  | "manual_action_required"
  | "provider_unavailable"
  | "output_insufficient_recovery_needed"
  | "redaction_failure_blocks_reporting";

export interface ProviderStreamReadiness {
  readonly status: ProviderStreamReadinessStatus;
  readonly failureClass?: ProviderFailureClass;
  readonly safeReason?: string;
}

export interface ProviderStreamAdapterProjection {
  readonly adapterId: string;
  readonly requestId: string;
  readonly responseId: string;
  readonly explicitOptIn: "granted" | "missing";
  readonly readinessStatus: ProviderStreamReadinessStatus;
  readonly status: ProviderStreamAdapterStatus;
  readonly fetchAttempted: boolean;
  readonly liveClassification: ProviderLiveAttemptClassification;
  readonly streamProjected: boolean;
  readonly assistantAccumulationStatus: "not_run" | ModelBoundaryPhaseProjection["assistantResponse"]["accumulationStatus"];
  readonly toolCallExtractionStatus: "not_run" | ModelBoundaryPhaseProjection["toolCallBatch"]["extractionStatus"];
  readonly failureClass?: ProviderFailureClass;
  readonly retryEligibility: ProviderRetryEligibility;
  readonly fallbackEligibility: ProviderFallbackEligibility;
  readonly fallbackStatus: ProviderFallbackStatus;
  readonly recoveryFacts: readonly ProviderRecoveryFact[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly nextAction: string;
  readonly modelBoundaryPhase?: ModelBoundaryPhaseProjection;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface RunProviderStreamAdapterInput {
  readonly adapterId: string;
  readonly requestBoundary: ModelRequestBoundary;
  readonly responseId: string;
  readonly streamId?: string;
  readonly turnId?: string;
  readonly explicitProviderOptIn: boolean;
  readonly readiness?: ProviderStreamReadiness;
  readonly request: ModelRequest;
  readonly fetchProviderResponse: (
    request: ModelRequest,
    signal?: AbortSignal,
  ) => Promise<ProviderStreamFetchOutcome> | ProviderStreamFetchOutcome;
  readonly signal?: AbortSignal;
  readonly notProvenClaims?: readonly string[];
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

export async function runProviderStreamAdapter(
  input: RunProviderStreamAdapterInput,
): Promise<ProviderStreamAdapterProjection> {
  const readiness = validateProviderStreamReadiness(input);
  if (readiness.failureClass) {
    return blockedProjection(input, readiness);
  }

  try {
    const outcome = await input.fetchProviderResponse(input.request, input.signal);
    const streamEvents = await providerFetchOutcomeToStreamEvents({
      requestId: input.requestBoundary.requestId,
      responseId: input.responseId,
      turnId: input.turnId,
      outcome,
    });
    const phase = projectPhase(input, streamEvents);
    return projectedProjection(input, phase);
  } catch (error) {
    const failureClass = input.signal?.aborted
      ? "provider_cancelled"
      : classifyProviderError(error);
    const phase = projectPhase(
      input,
      failureStreamEvents({
        requestId: input.requestBoundary.requestId,
        responseId: input.responseId,
        turnId: input.turnId,
        failureClass,
        cancelled: failureClass === "provider_cancelled",
      }),
    );
    return projectedProjection(input, phase, failureClass);
  }
}

function projectPhase(
  input: RunProviderStreamAdapterInput,
  streamEvents: readonly ProviderResponseStreamEvent[],
): ModelBoundaryPhaseProjection {
  return projectModelBoundaryPhase({
    phaseId: `${input.adapterId}:model-boundary`,
    turnId: input.turnId,
    requestBoundary: input.requestBoundary,
    responseId: input.responseId,
    streamId: input.streamId ?? `${input.adapterId}:stream`,
    streamEvents,
    notProvenClaims: adapterNotProvenClaims(input.notProvenClaims),
  });
}

function validateProviderStreamReadiness(
  input: RunProviderStreamAdapterInput,
): ProviderStreamReadiness {
  if (!input.explicitProviderOptIn) {
    return {
      status: "blocked",
      failureClass: "provider_config",
      safeReason: "explicit real-provider opt-in is required",
    };
  }
  if (input.requestBoundary.providerMode !== "real") {
    return {
      status: "blocked",
      failureClass: "provider_config",
      safeReason: "real provider mode is required",
    };
  }
  if (input.requestBoundary.providerReadinessStatus !== "ready") {
    return {
      status: "blocked",
      failureClass: "provider_config",
      safeReason: "provider readiness is not ready",
    };
  }
  if (input.requestBoundary.missingRequiredFacts.length > 0) {
    return {
      status: "blocked",
      failureClass: "provider_output_insufficient",
      safeReason: "required context or planning facts are missing",
    };
  }
  if (input.requestBoundary.modelSafeLabel === "model-not-selected") {
    return {
      status: "missing_config",
      failureClass: "provider_config",
      safeReason: "model safe label is missing",
    };
  }
  if (input.readiness && input.readiness.status !== "ready") {
    return {
      ...input.readiness,
      failureClass: input.readiness.failureClass ?? readinessFailureClass(input.readiness.status),
    };
  }
  return { status: "ready" };
}

function failureStreamEvents(input: {
  readonly requestId: string;
  readonly responseId: string;
  readonly turnId?: string;
  readonly failureClass: ProviderFailureClass;
  readonly cancelled: boolean;
}): readonly ProviderResponseStreamEvent[] {
  const base = {
    requestId: input.requestId,
    responseId: input.responseId,
    ...(input.turnId ? { turnId: input.turnId } : {}),
    retry: "not_allowed" as const,
  };
  return Object.freeze([
    { eventId: `${input.responseId}:started`, kind: "stream_started", ...base },
    input.cancelled
      ? {
          eventId: `${input.responseId}:cancelled`,
          kind: "stream_cancelled",
          cancellationKind: "provider_cancelled",
          ...base,
        }
      : {
          eventId: `${input.responseId}:failed`,
          kind: "stream_failed",
          failureClass: input.failureClass,
          fallbackEligible: false,
          ...base,
        },
  ]);
}

function blockedProjection(
  input: RunProviderStreamAdapterInput,
  readiness: ProviderStreamReadiness,
): ProviderStreamAdapterProjection {
  return deepFreeze({
    adapterId: sanitizeText(input.adapterId),
    requestId: input.requestBoundary.requestId,
    responseId: sanitizeText(input.responseId),
    explicitOptIn: input.explicitProviderOptIn ? "granted" : "missing",
    readinessStatus: readiness.status,
    status: input.explicitProviderOptIn ? "blocked" : "not_run",
    fetchAttempted: false,
    liveClassification: classifyLiveAttempt({
      fetchAttempted: false,
      readinessStatus: readiness.status,
      failureClass: readiness.failureClass,
    }),
    streamProjected: false,
    assistantAccumulationStatus: "not_run",
    toolCallExtractionStatus: "not_run",
    failureClass: readiness.failureClass,
    retryEligibility: "retry_not_allowed",
    fallbackEligibility: "fallback_not_eligible",
    fallbackStatus: "fallback_not_attempted",
    recoveryFacts: recoveryFacts({
      fetchAttempted: false,
      readinessStatus: readiness.status,
      failureClass: readiness.failureClass,
      retryEligibility: "retry_not_allowed",
      fallbackEligibility: "fallback_not_eligible",
    }),
    redaction: {
      status: input.requestBoundary.redaction.status,
      excluded: REDACTION_EXCLUSIONS,
    },
    nextAction: readiness.safeReason ?? "resolve provider readiness through the approved opt-in path",
    notProvenClaims: adapterNotProvenClaims(input.notProvenClaims),
    terminalSuccessClaim: false,
  });
}

function projectedProjection(
  input: RunProviderStreamAdapterInput,
  phase: ModelBoundaryPhaseProjection,
  failureClass?: ProviderFailureClass,
): ProviderStreamAdapterProjection {
  const streamFailure = failureClass ?? phase.stream.failure?.class;
  const retryEligibility = retryEligibilityForPhase(phase);
  const fallbackEligibility = phase.stream.failure?.fallbackEligibility === "eligible"
    ? "fallback_eligible"
    : "fallback_not_eligible";
  const redactionStatus = phase.stream.redaction.status === "redacted" ||
      phase.assistantResponse.redaction.status === "redacted" ||
      phase.toolCallBatch.redaction.status === "redacted"
    ? "redacted"
    : "report-safe";
  return deepFreeze({
    adapterId: sanitizeText(input.adapterId),
    requestId: input.requestBoundary.requestId,
    responseId: phase.responseBoundary.responseId,
    explicitOptIn: "granted",
    readinessStatus: input.readiness?.status ?? "ready",
    status: "projected",
    fetchAttempted: true,
    liveClassification: classifyLiveAttempt({
      fetchAttempted: true,
      readinessStatus: input.readiness?.status ?? "ready",
      failureClass: streamFailure,
      streamStatus: phase.stream.status,
      redactionStatus,
    }),
    streamProjected: true,
    assistantAccumulationStatus: phase.assistantResponse.accumulationStatus,
    toolCallExtractionStatus: phase.toolCallBatch.extractionStatus,
    ...(streamFailure ? { failureClass: streamFailure } : {}),
    retryEligibility,
    fallbackEligibility,
    fallbackStatus: "fallback_not_attempted",
    recoveryFacts: recoveryFacts({
      fetchAttempted: true,
      readinessStatus: input.readiness?.status ?? "ready",
      failureClass: streamFailure,
      retryEligibility,
      fallbackEligibility,
      redactionStatus,
    }),
    redaction: {
      status: redactionStatus,
      excluded: REDACTION_EXCLUSIONS,
    },
    nextAction: streamFailure
      ? "classify provider failure without treating it as task success"
      : "review model-boundary observations before any tool or mutation authority",
    modelBoundaryPhase: phase,
    notProvenClaims: adapterNotProvenClaims([
      ...phase.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function classifyLiveAttempt(input: {
  readonly fetchAttempted: boolean;
  readonly readinessStatus: ProviderStreamReadinessStatus;
  readonly failureClass?: ProviderFailureClass;
  readonly streamStatus?: ModelBoundaryPhaseProjection["stream"]["status"];
  readonly redactionStatus?: "report-safe" | "redacted";
}): ProviderLiveAttemptClassification {
  if (input.redactionStatus === "redacted" && input.failureClass === "provider_redaction_failure") {
    return "redaction_failed";
  }
  if (!input.fetchAttempted) {
    switch (input.readinessStatus) {
      case "missing_config":
        return "config_failed";
      case "missing_auth":
      case "auth_failed":
        return "auth_failed";
      case "network_failed":
        return "network_failed";
      case "unknown":
        return "unsupported";
      case "blocked":
      case "ready":
        return "provider_blocked";
    }
  }
  if (input.failureClass) {
    return liveClassificationForFailure(input.failureClass);
  }
  switch (input.streamStatus) {
    case "completed":
      return "live_completed";
    case "partial":
    case "streaming":
      return "live_partial";
    case "cancelled":
      return "cancelled";
    case "output_invalid":
      return "output_invalid";
    case "output_insufficient":
      return "output_insufficient";
    case "redaction_failed":
      return "redaction_failed";
    case "failed":
      return "unknown_failed";
    case "not_started":
    case undefined:
      return "provider_blocked";
  }
}

function liveClassificationForFailure(
  failureClass: ProviderFailureClass,
): ProviderLiveAttemptClassification {
  switch (failureClass) {
    case "provider_config":
      return "config_failed";
    case "provider_auth":
      return "auth_failed";
    case "provider_network":
      return "network_failed";
    case "provider_endpoint":
      return "endpoint_failed";
    case "provider_rate_limited":
      return "rate_limited";
    case "provider_timeout":
      return "timeout";
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
    case "provider_fallback_eligible":
    case "provider_fallback_ineligible":
    case "provider_unknown":
    default:
      return "unknown_failed";
  }
}

function retryEligibilityForPhase(
  phase: ModelBoundaryPhaseProjection,
): ProviderRetryEligibility {
  if (phase.stream.cancellation?.retryStatus === "retry_eligible") {
    return "retry_eligible";
  }
  return "retry_not_allowed";
}

function recoveryFacts(input: {
  readonly fetchAttempted: boolean;
  readonly readinessStatus: ProviderStreamReadinessStatus;
  readonly failureClass?: ProviderFailureClass;
  readonly retryEligibility: ProviderRetryEligibility;
  readonly fallbackEligibility: ProviderFallbackEligibility;
  readonly redactionStatus?: "report-safe" | "redacted";
}): readonly ProviderRecoveryFact[] {
  const facts = new Set<ProviderRecoveryFact>([
    input.retryEligibility,
    input.fallbackEligibility,
    "fallback_not_attempted",
  ]);
  if (!input.fetchAttempted || input.readinessStatus !== "ready") {
    facts.add("manual_action_required");
  }
  if (
    input.readinessStatus === "network_failed" ||
    input.failureClass === "provider_network" ||
    input.failureClass === "provider_endpoint" ||
    input.failureClass === "provider_rate_limited" ||
    input.failureClass === "provider_timeout"
  ) {
    facts.add("provider_unavailable");
  }
  if (input.failureClass === "provider_output_insufficient") {
    facts.add("output_insufficient_recovery_needed");
  }
  if (
    input.failureClass === "provider_redaction_failure" ||
    input.redactionStatus === "redacted"
  ) {
    facts.add("redaction_failure_blocks_reporting");
  }
  return Object.freeze([...facts]);
}

function classifyProviderError(error: unknown): ProviderFailureClass {
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

function readinessFailureClass(status: ProviderStreamReadinessStatus): ProviderFailureClass {
  switch (status) {
    case "missing_auth":
    case "auth_failed":
      return "provider_auth";
    case "missing_config":
      return "provider_config";
    case "network_failed":
      return "provider_network";
    case "blocked":
    case "unknown":
    case "ready":
      return "provider_config";
  }
}

function isNormalizedProviderError(error: unknown): error is NormalizedProviderError {
  return Boolean(
    error &&
      typeof error === "object" &&
      "kind" in error &&
      "provider" in error &&
      "message" in error &&
      "retriable" in error,
  );
}

function adapterNotProvenClaims(claims: readonly string[] = []): readonly string[] {
  return Object.freeze([...new Set([
    "explicit-opt-in-is-not-provider-success",
    "provider-attempted-is-not-provider-success",
    "provider-stream-projected-is-not-task-success",
    "assistant-accumulated-is-not-task-success",
    "tool-call-extracted-is-not-tool-executed",
    "model-boundary-completed-is-not-terminal-success",
    "product-surface-rendered-is-not-success",
    "terminal-success",
    ...claims,
  ])]);
}

function sanitizeText(value: string): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Authorization: Bearer [secret-redacted]")
    .replace(/\b(?:Bearer|token|api[_-]?key|secret)\s*[:=]?\s*[A-Za-z0-9._~+/-]+/gi, "[secret-redacted]")
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]")
    .slice(0, 180);
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
