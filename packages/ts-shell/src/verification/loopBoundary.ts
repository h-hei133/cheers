import type { ProductVerificationReceipt } from "./verificationFacade.js";

export type VerificationIntentDispatchStatus =
  | "planned"
  | "selected"
  | "authority_required"
  | "dispatched"
  | "passed"
  | "failed"
  | "blocked"
  | "unsupported"
  | "not_run";

export type VerificationIntentRelevanceStatus =
  | "task_relevant"
  | "probably_relevant"
  | "unrelated"
  | "unknown"
  | "not_proven";

export type VerificationResultObservationStatus =
  | "passed"
  | "failed"
  | "blocked"
  | "not_run"
  | "unsupported"
  | "selected_not_run"
  | "relevance_rejected";

export interface VerificationLoopIntent {
  readonly intentId: string;
  readonly sourceTurnId: string;
  readonly targetSummary: string;
  readonly verificationKind: "command" | "readback" | "owner_projection" | "unknown";
  readonly commandCandidateSummary?: string;
  readonly ownerDomain: "verification";
  readonly authorityRequirement: "not_required" | "required" | "granted" | "denied" | "unknown";
  readonly dispatchStatus: VerificationIntentDispatchStatus;
  readonly relevanceStatus: VerificationIntentRelevanceStatus;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface VerificationResultObservation {
  readonly verificationId: string;
  readonly intentId: string;
  readonly executionReceiptId?: string;
  readonly status: VerificationResultObservationStatus;
  readonly relevanceStatus: VerificationIntentRelevanceStatus;
  readonly failureClass?: string;
  readonly safeSummary: string;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function projectVerificationIntent(input: {
  readonly sourceTurnId: string;
  readonly targetSummary: string;
  readonly verificationKind?: VerificationLoopIntent["verificationKind"];
  readonly commandCandidateSummary?: string;
  readonly authorityRequirement?: VerificationLoopIntent["authorityRequirement"];
  readonly dispatchStatus?: VerificationIntentDispatchStatus;
  readonly relevanceStatus?: VerificationIntentRelevanceStatus;
  readonly receipt?: ProductVerificationReceipt;
  readonly notProvenClaims?: readonly string[];
}): VerificationLoopIntent {
  const redactions = new Set<string>();
  const dispatchStatus = input.dispatchStatus ??
    dispatchFromReceipt(input.receipt) ??
    "not_run";
  const relevanceStatus = input.relevanceStatus ??
    relevanceFromReceipt(input.receipt) ??
    "not_proven";
  const commandSummary = input.commandCandidateSummary ??
    input.receipt?.selectedCommand;
  return freeze({
    intentId: sanitizeId(`verification-intent:${input.sourceTurnId}`, redactions),
    sourceTurnId: sanitizeText(input.sourceTurnId, redactions, 160),
    targetSummary: sanitizeText(input.targetSummary, redactions, 180),
    verificationKind: input.verificationKind ?? "owner_projection",
    ...(commandSummary
      ? { commandCandidateSummary: sanitizeText(commandSummary, redactions, 180) }
      : {}),
    ownerDomain: "verification",
    authorityRequirement: input.authorityRequirement ??
      (input.receipt?.authority === "explicitly-approved"
        ? "granted"
        : input.receipt?.authority === "not-granted"
          ? "required"
          : "unknown"),
    dispatchStatus,
    relevanceStatus,
    redactionStatus: redactions.size > 0 ? "redacted" : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "verification-selected-is-not-success",
      "command-exit-zero-is-not-task-success",
      ...(input.receipt?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

export function observeVerificationResult(input: {
  readonly intent: VerificationLoopIntent;
  readonly status?: VerificationResultObservationStatus;
  readonly executionReceiptId?: string;
  readonly failureClass?: string;
  readonly safeSummary?: string;
  readonly receipt?: ProductVerificationReceipt;
  readonly notProvenClaims?: readonly string[];
}): VerificationResultObservation {
  const redactions = new Set<string>();
  const status = input.status ??
    resultStatusFromReceipt(input.receipt, input.intent) ??
    (input.intent.dispatchStatus === "selected" ? "selected_not_run" : "not_run");
  const failureClass = input.failureClass ?? input.receipt?.failureClass;
  return freeze({
    verificationId: sanitizeId(`${input.intent.intentId}:result`, redactions),
    intentId: sanitizeText(input.intent.intentId, redactions, 180),
    ...(input.executionReceiptId
      ? { executionReceiptId: sanitizeText(input.executionReceiptId, redactions, 180) }
      : {}),
    status,
    relevanceStatus: input.intent.relevanceStatus,
    ...(failureClass ? { failureClass: sanitizeText(failureClass, redactions, 120) } : {}),
    safeSummary: sanitizeText(
      input.safeSummary ??
        summaryFromStatus(status, input.intent.relevanceStatus),
      redactions,
      180,
    ),
    redactionStatus:
      redactions.size > 0 || input.intent.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "verification-result-observed-is-not-terminal-success",
      "command-exit-zero-is-not-task-success",
      ...(input.receipt?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ], redactions),
    terminalSuccessClaim: false,
  });
}

function dispatchFromReceipt(
  receipt?: ProductVerificationReceipt,
): VerificationIntentDispatchStatus | undefined {
  if (!receipt) return undefined;
  if (receipt.dispatchStatus === "not-run") return "not_run";
  if (receipt.runtimeStatus === "success") return "passed";
  if (receipt.runtimeStatus === "failed") return "failed";
  if (receipt.runtimeStatus === "blocked") return "blocked";
  return "dispatched";
}

function relevanceFromReceipt(
  receipt?: ProductVerificationReceipt,
): VerificationIntentRelevanceStatus | undefined {
  if (!receipt) return undefined;
  if (receipt.relevanceStatus === "relevant") return "task_relevant";
  if (receipt.relevanceStatus === "unrelated") return "unrelated";
  return "not_proven";
}

function resultStatusFromReceipt(
  receipt: ProductVerificationReceipt | undefined,
  intent: VerificationLoopIntent,
): VerificationResultObservationStatus | undefined {
  if (!receipt) return undefined;
  if (intent.relevanceStatus === "unrelated") return "relevance_rejected";
  if (receipt.dispatchStatus === "not-run" && receipt.selectedCommand) {
    return "selected_not_run";
  }
  if (receipt.dispatchStatus === "not-run") return "not_run";
  if (receipt.runtimeStatus === "success") return "passed";
  if (receipt.runtimeStatus === "failed") return "failed";
  if (receipt.runtimeStatus === "blocked") return "blocked";
  if (receipt.runtimeStatus === "skipped") return "not_run";
  return "unsupported";
}

function summaryFromStatus(
  status: VerificationResultObservationStatus,
  relevanceStatus: VerificationIntentRelevanceStatus,
): string {
  return `status=${status}; relevance=${relevanceStatus}; terminalSuccessClaim=false`;
}

function unique(values: readonly string[], redactions: Set<string>): readonly string[] {
  return freeze(Array.from(new Set(values.map((value) => sanitizeText(value, redactions, 120)))).sort());
}

function sanitizeId(value: string, redactions: Set<string>): string {
  return sanitizeText(value, redactions, 180)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeText(value: string, redactions: Set<string>, maxLength: number): string {
  let sanitized = value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/\s+/g, " ")
    .trim();
  if (sanitized !== value.trim()) {
    redactions.add("unsafe-content");
  }
  if (sanitized.length > maxLength) {
    sanitized = `${sanitized.slice(0, maxLength)}...`;
    redactions.add("truncated");
  }
  return sanitized;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}
