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
  readonly streamProjected: boolean;
  readonly assistantAccumulationStatus: "not_run" | ModelBoundaryPhaseProjection["assistantResponse"]["accumulationStatus"];
  readonly toolCallExtractionStatus: "not_run" | ModelBoundaryPhaseProjection["toolCallBatch"]["extractionStatus"];
  readonly failureClass?: ProviderFailureClass;
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
    streamProjected: false,
    assistantAccumulationStatus: "not_run",
    toolCallExtractionStatus: "not_run",
    failureClass: readiness.failureClass,
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
  return deepFreeze({
    adapterId: sanitizeText(input.adapterId),
    requestId: input.requestBoundary.requestId,
    responseId: phase.responseBoundary.responseId,
    explicitOptIn: "granted",
    readinessStatus: input.readiness?.status ?? "ready",
    status: "projected",
    fetchAttempted: true,
    streamProjected: true,
    assistantAccumulationStatus: phase.assistantResponse.accumulationStatus,
    toolCallExtractionStatus: phase.toolCallBatch.extractionStatus,
    ...(streamFailure ? { failureClass: streamFailure } : {}),
    redaction: {
      status: phase.stream.redaction.status === "redacted" ||
          phase.assistantResponse.redaction.status === "redacted" ||
          phase.toolCallBatch.redaction.status === "redacted"
        ? "redacted"
        : "report-safe",
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
