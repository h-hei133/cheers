import type { JsonRuntimeEventStreamEntry } from "../../events/stream.js";
import type { HostReplayFacts } from "../../../session/replay/host/facts.js";
import type { HostTruthProjection } from "../../../result/host/verdict.js";

export type HostCommandAction =
  | "start-turn"
  | "continue-session"
  | "get-status"
  | "list-session-heads"
  | "inspect-session-summary"
  | "cancel-work"
  | "stop-work"
  | "run-evaluation-case";

export type HostTurnMode = "read-only" | "mutation";
export type HostContinuationChoice = "active-leaf" | "new-child";
export type HostProviderMode = "synthetic" | "default-off";
export type HostOutputPreference = "structured" | "structured-with-diagnostics";
export type HostExitClassification =
  | "success-proof"
  | "completed-without-proof"
  | "blocked"
  | "failed"
  | "invalid-input"
  | "unsupported"
  | "cancelled"
  | "stopped"
  | "internal-error";

export interface HostCommandEnvelope {
  readonly action: HostCommandAction;
  readonly sessionId?: string;
  readonly inputText?: string;
  readonly mode?: HostTurnMode;
  readonly continuationChoice?: HostContinuationChoice;
  readonly providerMode?: HostProviderMode;
  readonly outputPreference?: HostOutputPreference;
  readonly correlationId?: string;
  readonly evaluationCaseId?: string;
}

export type HostBlockerKind =
  | "invalid-envelope"
  | "unsupported-command"
  | "missing-session"
  | "provider-blocked"
  | "continuation-blocked"
  | "cancel-requested"
  | "stop-requested"
  | "missing-proof";

export interface HostCommandBlocker {
  readonly kind: HostBlockerKind;
  readonly code: string;
  readonly detail: string;
  readonly terminalSuccessClaim: false;
}

export interface HostDiagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly terminalSuccessClaim: false;
}

export interface HostStatusSnapshot {
  readonly statusId: string;
  readonly sessionId?: string;
  readonly lifecycle:
    | "accepted"
    | "running"
    | "blocked"
    | "stopped"
    | "cancelled"
    | "completed"
    | "not-found";
  readonly activeTurnId?: string;
  readonly eventCount: number;
  readonly blockerCount: number;
  readonly nextAction: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface HostSessionHead {
  readonly sessionId: string;
  readonly activeLeafId: string;
  readonly activeBranchId?: string;
  readonly status: HostStatusSnapshot["lifecycle"];
  readonly updatedAt: string;
  readonly terminalSuccessClaim: false;
}

export interface HostSessionSummary {
  readonly sessionId: string;
  readonly activeLeafId: string;
  readonly activePath: readonly string[];
  readonly branchSupport: "not-proven" | "storage-backed";
  readonly compactionStatus: "not-proven" | "ready" | "blocked";
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface HostResultSummary {
  readonly status:
    | "accepted"
    | "blocked"
    | "stopped"
    | "cancelled"
    | "completed"
    | "not-proven";
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly evidenceVerdictStatus: string;
  readonly resultVerdictStatus: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface HostExitSummary {
  readonly classification: HostExitClassification;
  readonly code: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 70;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface HostCommandResponse {
  readonly schemaVersion: "host-command-response.v1";
  readonly action: HostCommandAction;
  readonly correlationId: string;
  readonly accepted: boolean;
  readonly sessionId?: string;
  readonly events: readonly JsonRuntimeEventStreamEntry[];
  readonly status: HostStatusSnapshot;
  readonly result: HostResultSummary;
  readonly diagnostics: readonly HostDiagnostic[];
  readonly blockers: readonly HostCommandBlocker[];
  readonly details: {
    readonly redaction: {
      readonly status: "report-safe" | "redacted";
      readonly excluded: readonly string[];
    };
    readonly sessionHeads?: readonly HostSessionHead[];
    readonly sessionSummary?: HostSessionSummary;
    readonly replayFacts?: HostReplayFacts;
    readonly truth?: HostTruthProjection;
    readonly evaluation?: unknown;
  };
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface HostCommandValidation {
  readonly envelope: HostCommandEnvelope;
  readonly blockers: readonly HostCommandBlocker[];
  readonly diagnostics: readonly HostDiagnostic[];
  readonly accepted: boolean;
  readonly terminalSuccessClaim: false;
}

const ACTIONS = new Set<HostCommandAction>([
  "start-turn",
  "continue-session",
  "get-status",
  "list-session-heads",
  "inspect-session-summary",
  "cancel-work",
  "stop-work",
  "run-evaluation-case",
]);

export function validateHostCommandEnvelope(
  input: unknown,
): HostCommandValidation {
  const blockers: HostCommandBlocker[] = [];
  const diagnostics: HostDiagnostic[] = [];
  const record = isRecord(input) ? input : {};
  const action = typeof record.action === "string" && ACTIONS.has(record.action as HostCommandAction)
    ? record.action as HostCommandAction
    : undefined;

  if (!action) {
    blockers.push(blocker(
      typeof record.action === "string" ? "unsupported-command" : "invalid-envelope",
      typeof record.action === "string" ? "host.action.unsupported" : "host.action.invalid",
      typeof record.action === "string" ? "host action is unsupported" : "host action is required",
    ));
  }

  const envelope: HostCommandEnvelope = {
    action: action ?? "get-status",
    ...(stringField(record.sessionId) ? { sessionId: sanitizeText(record.sessionId) } : {}),
    ...(stringField(record.inputText) ? { inputText: sanitizeText(record.inputText) } : {}),
    ...(record.mode === "mutation" || record.mode === "read-only"
      ? { mode: record.mode }
      : {}),
    ...(record.continuationChoice === "active-leaf" ||
        record.continuationChoice === "new-child"
      ? { continuationChoice: record.continuationChoice }
      : {}),
    ...(record.providerMode === "synthetic" || record.providerMode === "default-off"
      ? { providerMode: record.providerMode }
      : {}),
    ...(record.outputPreference === "structured" ||
        record.outputPreference === "structured-with-diagnostics"
      ? { outputPreference: record.outputPreference }
      : {}),
    ...(stringField(record.correlationId)
      ? { correlationId: sanitizeText(record.correlationId) }
      : {}),
    ...(stringField(record.evaluationCaseId)
      ? { evaluationCaseId: sanitizeText(record.evaluationCaseId) }
      : {}),
  };

  if (
    action === "start-turn" || action === "continue-session"
  ) {
    if (!stringField(record.inputText)) {
      blockers.push(blocker("invalid-envelope", "host.input.missing", "input text is required"));
    }
  }
  if (
    action === "continue-session" ||
    action === "get-status" ||
    action === "inspect-session-summary" ||
    action === "cancel-work" ||
    action === "stop-work"
  ) {
    if (!stringField(record.sessionId)) {
      blockers.push(blocker("invalid-envelope", "host.session.missing", "session id is required"));
    }
  }
  if (record.providerMode === "real") {
    blockers.push(blocker("provider-blocked", "host.provider.default-off", "live provider mode is not available through this host lane"));
  }
  if (action === "run-evaluation-case" && !stringField(record.evaluationCaseId)) {
    blockers.push(blocker("invalid-envelope", "host.evaluation-case.missing", "evaluation case id is required"));
  }

  if (record.outputPreference && !envelope.outputPreference) {
    diagnostics.push(diagnostic("host.output.defaulted", "warning", "output preference was defaulted to structured"));
  }

  return freeze({
    envelope,
    blockers,
    diagnostics,
    accepted: blockers.length === 0,
    terminalSuccessClaim: false,
  });
}

export function hostBlocker(
  kind: HostBlockerKind,
  code: string,
  detail: string,
): HostCommandBlocker {
  return blocker(kind, code, sanitizeText(detail));
}

export function hostDiagnostic(
  code: string,
  severity: HostDiagnostic["severity"],
  message: string,
): HostDiagnostic {
  return diagnostic(code, severity, sanitizeText(message));
}

export function sanitizeHostText(input: string): string {
  return sanitizeText(input);
}

function blocker(
  kind: HostBlockerKind,
  code: string,
  detail: string,
): HostCommandBlocker {
  return freeze({
    kind,
    code,
    detail,
    terminalSuccessClaim: false,
  });
}

function diagnostic(
  code: string,
  severity: HostDiagnostic["severity"],
  message: string,
): HostDiagnostic {
  return freeze({
    code,
    severity,
    message,
    terminalSuccessClaim: false,
  });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input && typeof input === "object" && !Array.isArray(input));
}

function stringField(input: unknown): input is string {
  return typeof input === "string" && input.trim().length > 0;
}

function sanitizeText(input: string): string {
  return input
    .replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [secret-redacted]")
    .replace(/\btoken=[^\s;,)]+/gi, "token=[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
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
