import type { ProviderFailureClass } from "../registry/provider.js";
import type { NextTurnModelRequestPreparation } from "./boundary.js";

export type ModelInvocationOptInState =
  | "missing"
  | "present"
  | "invalid"
  | "not_applicable";

export type ModelInvocationEligibilityStatus =
  | "eligible_for_explicit_invocation"
  | "blocked_by_missing_opt_in"
  | "blocked_by_auth"
  | "blocked_by_provider_unavailable"
  | "blocked_by_redaction"
  | "blocked_by_request_not_ready"
  | "blocked_by_policy"
  | "unsupported"
  | "not_ready";

export type ModelInvocationAttemptStatus =
  | "not_attempted"
  | "blocked"
  | "attempted"
  | "completed"
  | "failed"
  | "cancelled"
  | "unsupported";

export type ModelInvocationMode =
  | "metadata_only"
  | "explicit_invocation";

export type ModelInvocationRetryEligibility =
  | "retry_metadata_unavailable"
  | "retry_eligible"
  | "retry_ineligible";

export type ModelInvocationFallbackEligibility =
  | "fallback_metadata_unavailable"
  | "fallback_eligible"
  | "fallback_ineligible";

export interface ModelInvocationOptInFact {
  readonly state: ModelInvocationOptInState;
  readonly sourceSafeLabel: string;
}

export interface ModelInvocationGateInput {
  readonly gateId?: string;
  readonly requestPreparation: NextTurnModelRequestPreparation;
  readonly explicitOptIn?: ModelInvocationOptInFact;
  readonly policyBlocked?: boolean;
  readonly abortSignal?: AbortSignal;
  readonly notProvenClaims?: readonly string[];
}

export interface ModelInvocationGateFacts {
  readonly gateId: string;
  readonly sourcePreparedRequestId: string;
  readonly providerMetadataId?: string;
  readonly modelMetadataId?: string;
  readonly providerSafeLabel: string;
  readonly modelSafeLabel: string;
  readonly optInState: ModelInvocationOptInState;
  readonly optInSourceSafeLabel: string;
  readonly authReadinessState: NextTurnModelRequestPreparation["providerMetadata"]["authReadiness"];
  readonly redactionState: "report-safe" | "redacted";
  readonly requestReadinessState: NextTurnModelRequestPreparation["readinessStatus"];
  readonly eligibilityStatus: ModelInvocationEligibilityStatus;
  readonly blockedReasons: readonly string[];
  readonly requiredUserAction: string;
  readonly retryEligibility: ModelInvocationRetryEligibility;
  readonly fallbackEligibility: ModelInvocationFallbackEligibility;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ModelInvocationAttemptEnvelopeInput {
  readonly attemptId?: string;
  readonly gate: ModelInvocationGateFacts;
  readonly invocationMode?: ModelInvocationMode;
  readonly observedStatus?: ModelInvocationAttemptStatus;
  readonly failureClass?: ProviderFailureClass;
  readonly notProvenClaims?: readonly string[];
}

export interface ModelInvocationAttemptEnvelope {
  readonly attemptId: string;
  readonly sourceGateId: string;
  readonly sourcePreparedRequestId: string;
  readonly providerSafeLabel: string;
  readonly modelSafeLabel: string;
  readonly invocationMode: ModelInvocationMode;
  readonly attemptStatus: ModelInvocationAttemptStatus;
  readonly failureClass?: ProviderFailureClass;
  readonly redactionState: "report-safe" | "redacted";
  readonly retryEligibility: ModelInvocationRetryEligibility;
  readonly fallbackEligibility: ModelInvocationFallbackEligibility;
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

export function createModelInvocationGate(
  input: ModelInvocationGateInput,
): ModelInvocationGateFacts {
  const redactions = new Set<string>();
  const preparation = input.requestPreparation;
  const optIn = input.explicitOptIn ?? {
    state: "missing" as const,
    sourceSafeLabel: "explicit-opt-in-not-present",
  };
  const blockedReasons = gateBlockedReasons({
    preparation,
    optInState: optIn.state,
    policyBlocked: input.policyBlocked ?? false,
    aborted: input.abortSignal?.aborted ?? false,
    redactions,
  });
  const eligibilityStatus = gateEligibility({
    preparation,
    optInState: optIn.state,
    policyBlocked: input.policyBlocked ?? false,
    aborted: input.abortSignal?.aborted ?? false,
  });

  return deepFreeze({
    gateId: sanitizeText(
      input.gateId ?? `model-invocation-gate:${preparation.requestPreparationId}`,
      redactions,
    ),
    sourcePreparedRequestId: sanitizeText(preparation.requestPreparationId, redactions),
    ...(preparation.providerMetadataId
      ? { providerMetadataId: sanitizeText(preparation.providerMetadataId, redactions) }
      : {}),
    ...(preparation.modelMetadataId
      ? { modelMetadataId: sanitizeText(preparation.modelMetadataId, redactions) }
      : {}),
    providerSafeLabel: sanitizeText(preparation.providerMetadata.providerSafeLabel, redactions),
    modelSafeLabel: sanitizeText(preparation.providerMetadata.modelSafeLabel, redactions),
    optInState: optIn.state,
    optInSourceSafeLabel: sanitizeText(optIn.sourceSafeLabel, redactions),
    authReadinessState: preparation.providerMetadata.authReadiness,
    redactionState: redactions.size > 0 || preparation.redaction.status === "redacted"
      ? "redacted"
      : "report-safe",
    requestReadinessState: preparation.readinessStatus,
    eligibilityStatus,
    blockedReasons,
    requiredUserAction: requiredUserAction(eligibilityStatus),
    retryEligibility: retryEligibility(preparation),
    fallbackEligibility: fallbackEligibility(preparation),
    notProvenClaims: unique([
      "request-prepared-is-not-provider-invocation",
      "eligible-gate-is-not-attempted",
      "invocation-attempted-is-not-provider-success",
      "provider-completed-is-not-task-success",
      "fallback-eligible-is-not-fallback-executed",
      "product-surface-rendered-is-not-success",
      "terminal-success",
      ...preparation.notProvenClaims,
      ...preparation.providerMetadata.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

export function createModelInvocationAttemptEnvelope(
  input: ModelInvocationAttemptEnvelopeInput,
): ModelInvocationAttemptEnvelope {
  const redactions = new Set<string>();
  const status = input.gate.eligibilityStatus === "eligible_for_explicit_invocation"
    ? input.observedStatus ?? "not_attempted"
    : input.gate.eligibilityStatus === "unsupported"
      ? "unsupported"
      : input.gate.eligibilityStatus === "not_ready"
        ? "not_attempted"
        : "blocked";
  const failureClass = input.failureClass ?? failureClassForGate(input.gate);

  return deepFreeze({
    attemptId: sanitizeText(
      input.attemptId ?? `model-invocation-attempt:${input.gate.gateId}`,
      redactions,
    ),
    sourceGateId: sanitizeText(input.gate.gateId, redactions),
    sourcePreparedRequestId: sanitizeText(input.gate.sourcePreparedRequestId, redactions),
    providerSafeLabel: sanitizeText(input.gate.providerSafeLabel, redactions),
    modelSafeLabel: sanitizeText(input.gate.modelSafeLabel, redactions),
    invocationMode: input.invocationMode ?? "metadata_only",
    attemptStatus: status,
    ...(failureClass ? { failureClass } : {}),
    redactionState: redactions.size > 0 || input.gate.redactionState === "redacted"
      ? "redacted"
      : "report-safe",
    retryEligibility: input.gate.retryEligibility,
    fallbackEligibility: input.gate.fallbackEligibility,
    notProvenClaims: unique([
      "eligible-gate-is-not-attempted",
      "invocation-attempted-is-not-provider-success",
      "provider-completed-is-not-task-success",
      "fallback-eligible-is-not-fallback-executed",
      "terminal-success",
      ...input.gate.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function gateEligibility(input: {
  readonly preparation: NextTurnModelRequestPreparation;
  readonly optInState: ModelInvocationOptInState;
  readonly policyBlocked: boolean;
  readonly aborted: boolean;
}): ModelInvocationEligibilityStatus {
  if (input.aborted) {
    return "not_ready";
  }
  if (input.policyBlocked) {
    return "blocked_by_policy";
  }
  if (input.preparation.readinessStatus === "unsupported") {
    return "unsupported";
  }
  if (input.optInState !== "present" && input.optInState !== "not_applicable") {
    return "blocked_by_missing_opt_in";
  }
  if (input.preparation.providerMetadata.authReadiness !== "resolved") {
    return "blocked_by_auth";
  }
  if (
    input.preparation.providerMetadata.missingProviderFacts.some((fact) =>
      fact.includes("provider-metadata-missing") || fact.includes("provider-readiness:")
    ) ||
    input.preparation.readinessStatus === "blocked_by_provider_unavailable"
  ) {
    return "blocked_by_provider_unavailable";
  }
  if (
    input.preparation.redaction.status === "redacted" ||
    input.preparation.readinessStatus === "blocked_by_redaction"
  ) {
    return "blocked_by_redaction";
  }
  if (input.preparation.readinessStatus === "ready_for_explicit_model_invocation") {
    return "eligible_for_explicit_invocation";
  }
  if (
    input.preparation.readinessStatus === "blocked_by_policy" ||
    input.preparation.readinessStatus === "blocked_by_authority" ||
    input.preparation.readinessStatus === "blocked_by_failed_tool"
  ) {
    return "blocked_by_policy";
  }
  return input.preparation.readinessStatus === "not_ready"
    ? "not_ready"
    : "blocked_by_request_not_ready";
}

function gateBlockedReasons(input: {
  readonly preparation: NextTurnModelRequestPreparation;
  readonly optInState: ModelInvocationOptInState;
  readonly policyBlocked: boolean;
  readonly aborted: boolean;
  readonly redactions: Set<string>;
}): readonly string[] {
  const eligibility = gateEligibility(input);
  return unique([
    ...input.preparation.blockedReasons,
    ...input.preparation.providerMetadata.missingProviderFacts,
    ...(input.aborted ? ["abort-signal-observed"] : []),
    ...(input.policyBlocked ? ["policy-blocked"] : []),
    ...(input.optInState !== "present" && input.optInState !== "not_applicable"
      ? [`explicit-opt-in:${input.optInState}`]
      : []),
    ...(input.preparation.providerMetadata.authReadiness !== "resolved"
      ? [`auth-readiness:${input.preparation.providerMetadata.authReadiness}`]
      : []),
    ...(input.preparation.redaction.status === "redacted"
      ? ["redaction-state:redacted"]
      : []),
    ...(eligibility === "eligible_for_explicit_invocation"
      ? []
      : [`eligibility:${eligibility}`]),
  ].map((value) => sanitizeText(value, input.redactions)));
}

function requiredUserAction(status: ModelInvocationEligibilityStatus): string {
  switch (status) {
    case "eligible_for_explicit_invocation":
      return "explicit invocation may be attempted through an approved invocation boundary";
    case "blocked_by_missing_opt_in":
      return "provide explicit provider invocation opt-in through an approved runtime gate";
    case "blocked_by_auth":
      return "resolve provider auth readiness without exposing credentials";
    case "blocked_by_provider_unavailable":
      return "resolve provider availability before invocation";
    case "blocked_by_redaction":
      return "remove or summarize unsafe request facts before invocation";
    case "blocked_by_request_not_ready":
      return "prepare a ready request before invocation";
    case "blocked_by_policy":
      return "resolve policy or authority blockers before invocation";
    case "unsupported":
      return "use a supported provider and model boundary";
    case "not_ready":
      return "wait for the runtime boundary to become ready";
  }
}

function retryEligibility(
  preparation: NextTurnModelRequestPreparation,
): ModelInvocationRetryEligibility {
  return preparation.providerMetadata.missingProviderFacts.length > 0 ||
    preparation.readinessStatus === "blocked_by_provider_unavailable"
    ? "retry_eligible"
    : "retry_metadata_unavailable";
}

function fallbackEligibility(
  preparation: NextTurnModelRequestPreparation,
): ModelInvocationFallbackEligibility {
  const fallbackFacts = preparation.providerMetadata.fallbackMetadata.join(";");
  if (fallbackFacts.includes("executesFallback:false")) {
    return "fallback_ineligible";
  }
  if (fallbackFacts.includes("executesFallback:true")) {
    return "fallback_eligible";
  }
  return "fallback_metadata_unavailable";
}

function failureClassForGate(gate: ModelInvocationGateFacts): ProviderFailureClass | undefined {
  switch (gate.eligibilityStatus) {
    case "blocked_by_auth":
      return "provider_auth";
    case "blocked_by_missing_opt_in":
    case "blocked_by_policy":
    case "blocked_by_request_not_ready":
    case "not_ready":
    case "unsupported":
      return "provider_config";
    case "blocked_by_provider_unavailable":
      return "provider_network";
    case "blocked_by_redaction":
      return "provider_redaction_failure";
    case "eligible_for_explicit_invocation":
      return undefined;
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
    redactions.add("unsafe-invocation-boundary-input");
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

export const MODEL_INVOCATION_REDACTION_EXCLUSIONS = REDACTION_EXCLUSIONS;
