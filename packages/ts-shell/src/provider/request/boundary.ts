import type { ContextPlanningBlockSummary } from "../../context/acquisition/summary.js";
import type { ProviderRegistryProjection } from "../registry/provider.js";

export type ModelRequestReadinessStatus =
  | "ready"
  | "blocked_missing_required_facts"
  | "blocked_provider_not_ready"
  | "review_only"
  | "not_proven";

export interface ModelRequestBoundaryInput {
  readonly requestId: string;
  readonly turnId?: string;
  readonly loopId?: string;
  readonly providerId?: string;
  readonly providerMode?: "synthetic" | "real" | "default";
  readonly providerSafeLabel?: string;
  readonly modelSafeLabel?: string;
  readonly providerReadinessStatus?: "ready" | "missing" | "blocked" | "unknown";
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly contextPlanningSummary?: ContextPlanningBlockSummary;
  readonly planningConstraints?: readonly string[];
  readonly noWriteStatus?: string;
  readonly missingRequiredFacts?: readonly string[];
  readonly missingOptionalFacts?: readonly string[];
  readonly notProvenClaims?: readonly string[];
}

export interface ModelRequestBoundary {
  readonly requestId: string;
  readonly turnId?: string;
  readonly loopId?: string;
  readonly providerId?: string;
  readonly providerSafeLabel: string;
  readonly modelSafeLabel: string;
  readonly providerMode: "synthetic" | "real" | "default";
  readonly readinessStatus: ModelRequestReadinessStatus;
  readonly providerReadinessStatus: "ready" | "missing" | "blocked" | "unknown";
  readonly providerDefaultEnablement: "disabled";
  readonly providerRequiresExplicitOptIn: true;
  readonly registryProviderCount: number;
  readonly registryModelCount: number;
  readonly contextPlanningSummaryId?: string;
  readonly contextPlanningStatus?: string;
  readonly planningConstraints: readonly string[];
  readonly noWriteStatus: string;
  readonly mutationAuthority: "not-granted";
  readonly missingRequiredFacts: readonly string[];
  readonly missingOptionalFacts: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
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

export function createModelRequestBoundary(
  input: ModelRequestBoundaryInput,
): ModelRequestBoundary {
  const redactions = new Set<string>();
  const requiredMissing = unique([
    ...(input.contextPlanningSummary?.acquisition.requiredMissingFacts ?? []),
    ...(input.missingRequiredFacts ?? []),
  ].map((item) => sanitizeText(item, redactions)));
  const optionalMissing = unique([
    ...(input.contextPlanningSummary?.acquisition.optionalMissingFacts ?? []),
    ...(input.missingOptionalFacts ?? []),
  ].map((item) => sanitizeText(item, redactions)));
  const constraints = unique([
    ...(input.contextPlanningSummary?.planning.constraints ?? []),
    ...(input.planningConstraints ?? []),
  ].map((item) => sanitizeText(item, redactions)));
  const providerReadinessStatus = input.providerReadinessStatus ?? "unknown";
  const noWriteStatus = sanitizeText(
    input.noWriteStatus ??
      input.contextPlanningSummary?.handoff.editNoWriteStatus ??
      "no-write-authority-granted",
    redactions,
  );

  return deepFreeze({
    requestId: sanitizeText(input.requestId || "model-request-unavailable", redactions),
    ...(input.turnId ? { turnId: sanitizeText(input.turnId, redactions) } : {}),
    ...(input.loopId ? { loopId: sanitizeText(input.loopId, redactions) } : {}),
    ...(input.providerId ? { providerId: sanitizeText(input.providerId, redactions) } : {}),
    providerSafeLabel: sanitizeText(input.providerSafeLabel ?? "provider-not-selected", redactions),
    modelSafeLabel: sanitizeText(input.modelSafeLabel ?? "model-not-selected", redactions),
    providerMode: input.providerMode ?? "default",
    readinessStatus: selectReadinessStatus({
      providerReadinessStatus,
      requiredMissingCount: requiredMissing.length,
      noWriteStatus,
    }),
    providerReadinessStatus,
    providerDefaultEnablement: "disabled",
    providerRequiresExplicitOptIn: true,
    registryProviderCount: input.providerRegistry?.providers.length ?? 0,
    registryModelCount: input.providerRegistry?.models.length ?? 0,
    ...(input.contextPlanningSummary
      ? {
          contextPlanningSummaryId: sanitizeText(input.contextPlanningSummary.summaryId, redactions),
          contextPlanningStatus: input.contextPlanningSummary.status,
        }
      : {}),
    planningConstraints: Object.freeze(constraints),
    noWriteStatus,
    mutationAuthority: "not-granted",
    missingRequiredFacts: Object.freeze(requiredMissing),
    missingOptionalFacts: Object.freeze(optionalMissing),
    redaction: {
      status: redactions.size > 0 ||
          input.providerRegistry?.redaction.status === "redacted"
        ? "redacted"
        : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: unique([
      "model-request-prepared-is-not-provider-success",
      "provider-readiness-is-not-provider-success",
      "provider-called-is-not-provider-success",
      "cp-plan-handoff-is-not-mutation-authority",
      "request-ready-is-not-task-success",
      "fallback-eligible-is-not-fallback-executed",
      "terminal-success",
      ...(input.providerRegistry?.notProvenClaims ?? []),
      ...(input.contextPlanningSummary?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function selectReadinessStatus(input: {
  readonly providerReadinessStatus: ModelRequestBoundary["providerReadinessStatus"];
  readonly requiredMissingCount: number;
  readonly noWriteStatus: string;
}): ModelRequestReadinessStatus {
  if (input.requiredMissingCount > 0) {
    return "blocked_missing_required_facts";
  }
  if (input.providerReadinessStatus === "missing" || input.providerReadinessStatus === "blocked") {
    return "blocked_provider_not_ready";
  }
  if (input.providerReadinessStatus === "ready" && input.noWriteStatus.includes("no-write")) {
    return "review_only";
  }
  return input.providerReadinessStatus === "ready" ? "ready" : "not_proven";
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
    redactions.add("unsafe-request-boundary-input");
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
