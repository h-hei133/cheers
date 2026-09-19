import { freezeDeep } from "../../core/values/freeze.js";
import type { RuntimePhase } from "../../runtime/runtimePhase.js";
import type { RuntimeExecutionReceiptProjection } from "../../runtime/execution/receipt.js";
import type { RuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";

export type RuntimeSavePointRedactionStatus = "report-safe" | "redacted";

export interface RuntimeToolOutcomeSavePointInput {
  readonly inputId: string;
  readonly sourceBundleId: string;
  readonly receiptIds: readonly string[];
  readonly resultMessageIds: readonly string[];
  readonly partialOutcomeFacts: readonly string[];
  readonly blockedFacts: readonly string[];
  readonly failedFacts: readonly string[];
  readonly redactionStatus: RuntimeSavePointRedactionStatus;
  readonly evidenceOnly: true;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

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
  readonly toolResultMessageIds?: readonly string[];
  readonly toolResultDetailIds?: readonly string[];
  readonly beforeToolDecisionIds?: readonly string[];
  readonly afterToolAnnotationIds?: readonly string[];
  readonly nextTurnBundleId?: string;
  readonly verificationIntentIds?: readonly string[];
  readonly verificationResultIds?: readonly string[];
  readonly postRepairVerificationRequirementIds?: readonly string[];
  readonly postRepairVerificationRequestIds?: readonly string[];
  readonly postRepairVerificationResultIds?: readonly string[];
  readonly repairHandoffIds?: readonly string[];
  readonly repairProposalIds?: readonly string[];
  readonly repairApplyIds?: readonly string[];
  readonly sessionProjectionIds?: readonly string[];
  readonly contextProjectionIds?: readonly string[];
  readonly pendingNextTurnFacts?: readonly string[];
  readonly toolOutcomeInput?: RuntimeToolOutcomeSavePointInput;
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
  readonly toolResultMessageIds: readonly string[];
  readonly toolResultDetailIds: readonly string[];
  readonly beforeToolDecisionIds: readonly string[];
  readonly afterToolAnnotationIds: readonly string[];
  readonly nextTurnBundleId?: string;
  readonly verificationIntentIds: readonly string[];
  readonly verificationResultIds: readonly string[];
  readonly postRepairVerificationRequirementIds: readonly string[];
  readonly postRepairVerificationRequestIds: readonly string[];
  readonly postRepairVerificationResultIds: readonly string[];
  readonly repairHandoffIds: readonly string[];
  readonly repairProposalIds: readonly string[];
  readonly repairApplyIds: readonly string[];
  readonly sessionProjectionIds: readonly string[];
  readonly contextProjectionIds: readonly string[];
  readonly pendingNextTurnFacts: readonly string[];
  readonly toolOutcomeInput?: RuntimeToolOutcomeSavePointInput;
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
  const toolOutcomeInput = input.toolOutcomeInput
    ? sanitizeToolOutcomeInput(input.toolOutcomeInput, redactions)
    : undefined;
  return freezeDeep({
    id: `${input.turnSnapshot.id}:save-point`,
    phase: input.phase,
    turnSnapshotId: input.turnSnapshot.id,
    safeEvidenceIds: Object.freeze(Array.from(new Set(safeEvidenceIds)).sort()),
    sessionPersistenceStatus: input.sessionPersistenceStatus ?? "not-recorded",
    resultProjectionStatus: "observed-not-verdict",
    ...(observedResult ? { observedResult: Object.freeze(observedResult) } : {}),
    executionReceipts: Object.freeze(executionReceipts),
    toolResultMessageIds: Object.freeze(
      (input.toolResultMessageIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    toolResultDetailIds: Object.freeze(
      (input.toolResultDetailIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    beforeToolDecisionIds: Object.freeze(
      (input.beforeToolDecisionIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    afterToolAnnotationIds: Object.freeze(
      (input.afterToolAnnotationIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    ...(input.nextTurnBundleId
      ? { nextTurnBundleId: sanitizeEvidenceId(input.nextTurnBundleId, redactions) }
      : {}),
    verificationIntentIds: Object.freeze(
      (input.verificationIntentIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    verificationResultIds: Object.freeze(
      (input.verificationResultIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    postRepairVerificationRequirementIds: Object.freeze(
      (input.postRepairVerificationRequirementIds ?? []).map((id) =>
        sanitizeEvidenceId(id, redactions)
      ),
    ),
    postRepairVerificationRequestIds: Object.freeze(
      (input.postRepairVerificationRequestIds ?? []).map((id) =>
        sanitizeEvidenceId(id, redactions)
      ),
    ),
    postRepairVerificationResultIds: Object.freeze(
      (input.postRepairVerificationResultIds ?? []).map((id) =>
        sanitizeEvidenceId(id, redactions)
      ),
    ),
    repairHandoffIds: Object.freeze(
      (input.repairHandoffIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    repairProposalIds: Object.freeze(
      (input.repairProposalIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    repairApplyIds: Object.freeze(
      (input.repairApplyIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    sessionProjectionIds: Object.freeze(
      (input.sessionProjectionIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    contextProjectionIds: Object.freeze(
      (input.contextProjectionIds ?? []).map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    pendingNextTurnFacts: Object.freeze(
      (input.pendingNextTurnFacts ?? []).map((fact) =>
        sanitizeEvidenceId(fact, redactions),
      ),
    ),
    ...(toolOutcomeInput ? { toolOutcomeInput } : {}),
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

export function prepareToolOutcomeSavePointInput(input: {
  readonly sourceBundleId: string;
  readonly receiptIds: readonly string[];
  readonly resultMessageIds: readonly string[];
  readonly partialOutcomeFacts?: readonly string[];
  readonly blockedFacts?: readonly string[];
  readonly failedFacts?: readonly string[];
  readonly redactionStatus?: RuntimeSavePointRedactionStatus;
  readonly notProvenClaims?: readonly string[];
}): RuntimeToolOutcomeSavePointInput {
  const redactions = new Set<string>();
  const sourceBundleId = sanitizeEvidenceId(input.sourceBundleId, redactions);
  return freezeDeep({
    inputId: `${sourceBundleId}:save-point-input`,
    sourceBundleId,
    receiptIds: Object.freeze(
      input.receiptIds.map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    resultMessageIds: Object.freeze(
      input.resultMessageIds.map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    partialOutcomeFacts: Object.freeze(
      (input.partialOutcomeFacts ?? []).map((fact) => sanitizeEvidenceId(fact, redactions)),
    ),
    blockedFacts: Object.freeze(
      (input.blockedFacts ?? []).map((fact) => sanitizeEvidenceId(fact, redactions)),
    ),
    failedFacts: Object.freeze(
      (input.failedFacts ?? []).map((fact) => sanitizeEvidenceId(fact, redactions)),
    ),
    redactionStatus: redactions.size > 0 ? "redacted" : input.redactionStatus ?? "report-safe",
    evidenceOnly: true,
    notProvenClaims: Object.freeze([
      ...new Set([
        "terminal-success",
        "task-success",
        "save-point-success",
        "next-turn-success",
        "verification-success",
        ...(input.notProvenClaims ?? []).map((claim) => sanitizeEvidenceId(claim, redactions)),
      ]),
    ]),
    terminalSuccessClaim: false,
  });
}

function sanitizeToolOutcomeInput(
  input: RuntimeToolOutcomeSavePointInput,
  redactions: Set<string>,
): RuntimeToolOutcomeSavePointInput {
  return freezeDeep({
    inputId: sanitizeEvidenceId(input.inputId, redactions),
    sourceBundleId: sanitizeEvidenceId(input.sourceBundleId, redactions),
    receiptIds: Object.freeze(input.receiptIds.map((id) => sanitizeEvidenceId(id, redactions))),
    resultMessageIds: Object.freeze(
      input.resultMessageIds.map((id) => sanitizeEvidenceId(id, redactions)),
    ),
    partialOutcomeFacts: Object.freeze(
      input.partialOutcomeFacts.map((fact) => sanitizeEvidenceId(fact, redactions)),
    ),
    blockedFacts: Object.freeze(input.blockedFacts.map((fact) => sanitizeEvidenceId(fact, redactions))),
    failedFacts: Object.freeze(input.failedFacts.map((fact) => sanitizeEvidenceId(fact, redactions))),
    redactionStatus: input.redactionStatus === "redacted" || redactions.size > 0
      ? "redacted"
      : "report-safe",
    evidenceOnly: true,
    notProvenClaims: Object.freeze(
      input.notProvenClaims.map((claim) => sanitizeEvidenceId(claim, redactions)),
    ),
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
