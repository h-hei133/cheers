import type { ProviderFailureClass } from "../registry/provider.js";
import type { ModelInvocationFallbackEligibility } from "./invocation.js";

export type ProviderFallbackDecisionStatus =
  | "no_fallback"
  | "fallback_blocked"
  | "fallback_eligible"
  | "fallback_selected"
  | "fallback_attempted"
  | "fallback_failed"
  | "fallback_completed";

export type ProviderFallbackNextAction =
  | "continue"
  | "fallback"
  | "wait_for_user"
  | "fail";

export interface ProviderFallbackDecisionInput {
  readonly decisionId?: string;
  readonly sourceAttemptId?: string;
  readonly primaryFailureClass?: ProviderFailureClass;
  readonly fallbackEligibility: ModelInvocationFallbackEligibility;
  readonly eligibleFailureClasses?: readonly ProviderFailureClass[];
  readonly ineligibleFailureClasses?: readonly ProviderFailureClass[];
  readonly fallbackProviderSafeLabel?: string;
  readonly fallbackModelSafeLabel?: string;
  readonly explicitOptIn: boolean;
  readonly fallbackAttempted?: boolean;
  readonly fallbackCompleted?: boolean;
  readonly fallbackFailed?: boolean;
  readonly responseHandoffId?: string;
  readonly blockedReasons?: readonly string[];
  readonly notProvenClaims?: readonly string[];
}

export interface ProviderFallbackDecision {
  readonly decisionId: string;
  readonly sourceAttemptId?: string;
  readonly primaryFailureClass?: ProviderFailureClass;
  readonly status: ProviderFallbackDecisionStatus;
  readonly nextAction: ProviderFallbackNextAction;
  readonly fallbackEligibility: ModelInvocationFallbackEligibility;
  readonly selectedProviderSafeLabel?: string;
  readonly selectedModelSafeLabel?: string;
  readonly responseHandoffId?: string;
  readonly blockedReasons: readonly string[];
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

export function decideProviderFallback(
  input: ProviderFallbackDecisionInput,
): ProviderFallbackDecision {
  const redactions = new Set<string>();
  const blockedReasons = fallbackBlockedReasons(input).map((reason) =>
    sanitizeText(reason, redactions)
  );
  const status = fallbackStatus(input, blockedReasons);
  const selected = status === "fallback_selected" ||
    status === "fallback_attempted" ||
    status === "fallback_failed" ||
    status === "fallback_completed";

  return deepFreeze({
    decisionId: sanitizeText(input.decisionId ?? "provider-fallback-decision", redactions),
    ...(input.sourceAttemptId
      ? { sourceAttemptId: sanitizeText(input.sourceAttemptId, redactions) }
      : {}),
    ...(input.primaryFailureClass ? { primaryFailureClass: input.primaryFailureClass } : {}),
    status,
    nextAction: nextActionForStatus(status),
    fallbackEligibility: input.fallbackEligibility,
    ...(selected && input.fallbackProviderSafeLabel
      ? { selectedProviderSafeLabel: sanitizeText(input.fallbackProviderSafeLabel, redactions) }
      : {}),
    ...(selected && input.fallbackModelSafeLabel
      ? { selectedModelSafeLabel: sanitizeText(input.fallbackModelSafeLabel, redactions) }
      : {}),
    ...(input.responseHandoffId
      ? { responseHandoffId: sanitizeText(input.responseHandoffId, redactions) }
      : {}),
    blockedReasons: Object.freeze(blockedReasons),
    notProvenClaims: unique([
      "fallback-eligible-is-not-fallback-executed",
      "fallback-selected-is-not-provider-success",
      "fallback-attempted-is-not-task-success",
      "fallback-response-is-not-task-success",
      "terminal-success",
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function fallbackStatus(
  input: ProviderFallbackDecisionInput,
  blockedReasons: readonly string[],
): ProviderFallbackDecisionStatus {
  if (!input.primaryFailureClass) {
    return "no_fallback";
  }
  if (input.fallbackEligibility !== "fallback_eligible") {
    return "no_fallback";
  }
  if (blockedReasons.length > 0) {
    return "fallback_blocked";
  }
  if (input.fallbackCompleted) {
    return "fallback_completed";
  }
  if (input.fallbackFailed) {
    return "fallback_failed";
  }
  if (input.fallbackAttempted) {
    return "fallback_attempted";
  }
  if (input.fallbackProviderSafeLabel || input.fallbackModelSafeLabel) {
    return "fallback_selected";
  }
  return "fallback_eligible";
}

function fallbackBlockedReasons(input: ProviderFallbackDecisionInput): readonly string[] {
  if (!input.primaryFailureClass || input.fallbackEligibility !== "fallback_eligible") {
    return [];
  }
  return unique([
    ...((input.ineligibleFailureClasses ?? []).includes(input.primaryFailureClass)
      ? [`failure-class-ineligible:${input.primaryFailureClass}`]
      : []),
    ...((input.eligibleFailureClasses ?? []).length > 0 &&
        !(input.eligibleFailureClasses ?? []).includes(input.primaryFailureClass)
      ? [`failure-class-not-listed:${input.primaryFailureClass}`]
      : []),
    ...(input.explicitOptIn ? [] : ["fallback-explicit-opt-in-missing"]),
    ...(input.fallbackProviderSafeLabel || input.fallbackModelSafeLabel
      ? []
      : ["fallback-target-missing"]),
    ...(input.blockedReasons ?? []),
  ]);
}

function nextActionForStatus(status: ProviderFallbackDecisionStatus): ProviderFallbackNextAction {
  switch (status) {
    case "fallback_selected":
      return "fallback";
    case "fallback_attempted":
    case "fallback_completed":
      return "continue";
    case "fallback_blocked":
      return "wait_for_user";
    case "fallback_failed":
    case "no_fallback":
    case "fallback_eligible":
      return status === "fallback_eligible" ? "fallback" : "fail";
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
    redactions.add("unsafe-fallback-boundary-input");
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

export const PROVIDER_FALLBACK_REDACTION_EXCLUSIONS = REDACTION_EXCLUSIONS;
