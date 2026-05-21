import {
  hashContent,
} from "./patchRecovery/recoveryAuthorityStore.js";
import type { TargetSetEditJournalEntry } from "./targetSetEditJournal.js";
import type { TargetSetEditPreflightPolicy } from "./targetSetEditPolicy.js";
import type { TargetSetEditRecoveryWorkflow } from "./targetSetEditRecoveryWorkflow.js";
import type { TargetSetEditVerificationAggregate } from "./targetSetEditVerification.js";

export type TargetSetEditTransactionStatus =
  | "planned"
  | "preflight-stopped"
  | "executing"
  | "succeeded"
  | "partial-failure"
  | "failed"
  | "recovery-available"
  | "recovery-applied"
  | "recovery-partial-failure";

export interface TargetSetEditTransaction {
  readonly transactionId: string;
  readonly manifestId: string;
  readonly confirmedTargetSet: readonly string[];
  readonly maxFileGuardStatus:
    | "within-limit"
    | "over-limit"
    | "not-evaluated";
  readonly preflightStatus: "passed" | "stopped";
  readonly executionStatus:
    | "not-started"
    | "succeeded"
    | "partial-failure"
    | "failed-before-change";
  readonly verificationStatus: TargetSetEditVerificationAggregate["overallStatus"];
  readonly recoveryStatus: TargetSetEditRecoveryWorkflow["status"];
  readonly redactionStatus: "raw-content-excluded";
  readonly outcome: TargetSetEditTransactionStatus;
  readonly journal: readonly TargetSetEditJournalEntry[];
  readonly evidence: readonly string[];
}

export function buildTargetSetEditTransactionId(input: {
  readonly manifestId: string;
  readonly confirmedTargetSet?: readonly string[];
}): string {
  const digest = hashContent(
    JSON.stringify({
      manifestId: input.manifestId,
      confirmedTargetSet: input.confirmedTargetSet ?? [],
    }),
  ).slice(0, 12);
  return `target-set-txn-${digest}`;
}

export function buildTargetSetEditTransaction(input: {
  readonly transactionId: string;
  readonly manifestId: string;
  readonly confirmedTargetSet: readonly string[];
  readonly policy: TargetSetEditPreflightPolicy;
  readonly changedFileCount: number;
  readonly failedFileCount: number;
  readonly verification: TargetSetEditVerificationAggregate;
  readonly recovery: TargetSetEditRecoveryWorkflow;
  readonly journal: readonly TargetSetEditJournalEntry[];
}): TargetSetEditTransaction {
  const executionStatus = classifyExecutionStatus({
    changedFileCount: input.changedFileCount,
    failedFileCount: input.failedFileCount,
    preflightStatus: input.policy.status,
  });
  const outcome = classifyOutcome({
    policy: input.policy,
    executionStatus,
    recovery: input.recovery,
  });
  return {
    transactionId: input.transactionId,
    manifestId: input.manifestId,
    confirmedTargetSet: [...input.confirmedTargetSet],
    maxFileGuardStatus: input.policy.maxFileGuard,
    preflightStatus: input.policy.status,
    executionStatus,
    verificationStatus: input.verification.overallStatus,
    recoveryStatus: input.recovery.status,
    redactionStatus: "raw-content-excluded",
    outcome,
    journal: input.journal,
    evidence: [
      `target-set-edit-transaction:id:${input.transactionId}`,
      `target-set-edit-transaction:manifest:${input.manifestId}`,
      `target-set-edit-transaction:outcome:${outcome}`,
      `target-set-edit-transaction:preflight:${input.policy.status}`,
      `target-set-edit-transaction:execution:${executionStatus}`,
      `target-set-edit-transaction:verification:${input.verification.overallStatus}`,
      `target-set-edit-transaction:recovery:${input.recovery.status}`,
      "target-set-edit-transaction:no-automatic-rollback",
      "target-set-edit-transaction:no-atomic-rollback",
      "target-set-edit-transaction:raw-content-excluded",
    ],
  };
}

function classifyExecutionStatus(input: {
  readonly changedFileCount: number;
  readonly failedFileCount: number;
  readonly preflightStatus: TargetSetEditPreflightPolicy["status"];
}): TargetSetEditTransaction["executionStatus"] {
  if (input.preflightStatus === "stopped") {
    return "not-started";
  }
  if (input.failedFileCount === 0) {
    return "succeeded";
  }
  return input.changedFileCount > 0
    ? "partial-failure"
    : "failed-before-change";
}

function classifyOutcome(input: {
  readonly policy: TargetSetEditPreflightPolicy;
  readonly executionStatus: TargetSetEditTransaction["executionStatus"];
  readonly recovery: TargetSetEditRecoveryWorkflow;
}): TargetSetEditTransactionStatus {
  if (input.policy.status === "stopped") {
    return "preflight-stopped";
  }
  if (input.executionStatus === "succeeded") {
    return "succeeded";
  }
  if (input.executionStatus === "partial-failure") {
    return input.recovery.status === "available"
      ? "recovery-available"
      : "partial-failure";
  }
  return "failed";
}
