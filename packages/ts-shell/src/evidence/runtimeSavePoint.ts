import type { RuntimePhase } from "../runtime/runtimePhase.js";
import type { RuntimeExecutionReceiptProjection } from "../runtime/execution/executionReceipt.js";
import type { RuntimeTurnSnapshot } from "../turn/turnSnapshot.js";

export type RuntimeSavePointRedactionStatus = "report-safe" | "redacted";

export interface RuntimeSavePointInput {
  readonly turnSnapshot: RuntimeTurnSnapshot;
  readonly phase: RuntimePhase;
  readonly evidenceIds?: readonly string[];
  readonly sessionPersistenceStatus?: "not-recorded" | "persisted" | "failed";
  readonly resultProjection?: {
    readonly status?: string;
    readonly terminalClassification?: string;
    readonly terminalReason?: string;
  };
  readonly executionReceipts?: readonly RuntimeExecutionReceiptProjection[];
  readonly pendingNextTurnFacts?: readonly string[];
  readonly notProvenClaims?: readonly string[];
}

export interface RuntimeSavePointExecutionReceipt {
  readonly receiptId: string;
  readonly executionStatus: "success" | "failure";
  readonly errorClass: string;
  readonly redactionStatus: RuntimeSavePointRedactionStatus;
  readonly evidenceCorrelationId: string;
}

export interface RuntimeEvidenceSavePoint {
  readonly id: string;
  readonly phase: RuntimePhase;
  readonly turnSnapshotId: string;
  readonly safeEvidenceIds: readonly string[];
  readonly sessionPersistenceStatus: "not-recorded" | "persisted" | "failed";
  readonly resultProjectionStatus: "observed-not-verdict";
  readonly observedResult?: {
    readonly status?: string;
    readonly terminalClassification?: string;
    readonly terminalReason?: string;
  };
  readonly executionReceipts: readonly RuntimeSavePointExecutionReceipt[];
  readonly pendingNextTurnFacts: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly redaction: {
    readonly status: RuntimeSavePointRedactionStatus;
    readonly redactions: readonly string[];
  };
  readonly terminalSuccessClaim: false;
}

export function createEvidenceOnlySavePoint(
  input: RuntimeSavePointInput,
): RuntimeEvidenceSavePoint {
  const redactions = new Set<string>();
  const safeEvidenceIds = (input.evidenceIds ?? []).map((id) =>
    sanitizeEvidenceId(id, redactions),
  );
  const observedResult = input.resultProjection
    ? {
        ...(input.resultProjection.status
          ? { status: sanitizeEvidenceId(input.resultProjection.status, redactions) }
          : {}),
        ...(input.resultProjection.terminalClassification
          ? {
              terminalClassification: sanitizeEvidenceId(
                input.resultProjection.terminalClassification,
                redactions,
              ),
            }
          : {}),
        ...(input.resultProjection.terminalReason
          ? {
              terminalReason: sanitizeEvidenceId(
                input.resultProjection.terminalReason,
                redactions,
              ),
            }
          : {}),
      }
    : undefined;
  const executionReceipts = (input.executionReceipts ?? []).map((receipt) =>
    Object.freeze({
      receiptId: sanitizeEvidenceId(receipt.receiptId, redactions),
      executionStatus: receipt.executionStatus,
      errorClass: sanitizeEvidenceId(receipt.errorClass, redactions),
      redactionStatus: receipt.redaction.status,
      evidenceCorrelationId: sanitizeEvidenceId(receipt.evidenceCorrelationId, redactions),
    }),
  );
  return deepFreeze({
    id: `${input.turnSnapshot.id}:save-point`,
    phase: input.phase,
    turnSnapshotId: input.turnSnapshot.id,
    safeEvidenceIds: Object.freeze(Array.from(new Set(safeEvidenceIds)).sort()),
    sessionPersistenceStatus: input.sessionPersistenceStatus ?? "not-recorded",
    resultProjectionStatus: "observed-not-verdict",
    ...(observedResult ? { observedResult: Object.freeze(observedResult) } : {}),
    executionReceipts: Object.freeze(executionReceipts),
    pendingNextTurnFacts: Object.freeze(
      (input.pendingNextTurnFacts ?? []).map((fact) =>
        sanitizeEvidenceId(fact, redactions),
      ),
    ),
    notProvenClaims: Object.freeze([
      ...new Set([
        "provider-success",
        "proposal-success",
        "apply-success",
        "verification-success",
        "repair-success",
        ...(input.notProvenClaims ?? []).map((claim) =>
          sanitizeEvidenceId(claim, redactions),
        ),
      ]),
    ]),
    redaction: Object.freeze({
      status: redactions.size > 0 ? "redacted" : "report-safe",
      redactions: Object.freeze(Array.from(redactions).sort()),
    }),
    terminalSuccessClaim: false,
  });
}

function sanitizeEvidenceId(value: string, redactions: Set<string>): string {
  let sanitized = value.trim();
  const replacements: Array<[RegExp, string, string]> = [
    [
      /\/home\/wang\/\.private-agents-real[^\s"'`]*/g,
      "[redacted-real-provider-home]",
      "real-provider-home",
    ],
    [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]", "bearer-token"],
    [
      /\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
      "secret-field",
    ],
    [
      /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
      "[secret-redacted]",
      "secret-token",
    ],
    [
      /\b(oldText|newText)\b\s*[:=]\s*[\s\S]*/gi,
      "$1=[raw-edit-content-excluded]",
      "raw-edit-content",
    ],
    [
      /\b(hidden[-_ ]?reasoning|raw[-_ ]?provider[-_ ]?output|stdout|stderr)\b[\s\S]*/gi,
      "[raw-command-or-provider-content-excluded]",
      "raw-output",
    ],
  ];
  for (const [pattern, replacement, marker] of replacements) {
    const next = sanitized.replace(pattern, replacement);
    if (next !== sanitized) {
      redactions.add(marker);
      sanitized = next;
    }
  }
  if (sanitized.length > 180) {
    redactions.add("truncated");
    sanitized = `${sanitized.slice(0, 180)}...`;
  }
  return sanitized.length > 0 ? sanitized : "evidence:empty-redacted";
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
