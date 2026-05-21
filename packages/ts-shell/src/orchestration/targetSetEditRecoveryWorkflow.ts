export interface TargetSetEditRecoveryWorkflowTarget {
  readonly targetPath: string;
  readonly snapshotId?: string;
  readonly reason?: string;
}

export interface TargetSetEditRecoveryWorkflow {
  readonly status: "not-needed" | "available" | "unavailable";
  readonly eligibleRollbackTargets: readonly TargetSetEditRecoveryWorkflowTarget[];
  readonly ineligibleRollbackTargets: readonly TargetSetEditRecoveryWorkflowTarget[];
  readonly requiredConfirmation: "explicit-rollback-apply";
  readonly recoveryPlanId?: string;
  readonly safeSnapshotIds: readonly string[];
  readonly recommendation: string;
  readonly doNext: string;
  readonly automaticRollback: false;
  readonly atomicRollback: false;
  readonly evidence: readonly string[];
}

export function buildTargetSetEditRecoveryWorkflow(input: {
  readonly transactionId: string;
  readonly manifestId: string;
  readonly status: "written" | "preflight-stopped" | "partial-failure" | "failed";
  readonly fileResults: readonly {
    readonly targetPath: string;
    readonly status: "written" | "stopped" | "failed" | "not-run";
    readonly route?: { readonly snapshotReceipt?: { readonly snapshotId?: string } };
    readonly recoveryReadiness: "rollback-ready" | "rollback-not-run";
    readonly reason?: string;
  }[];
}): TargetSetEditRecoveryWorkflow {
  const eligibleRollbackTargets = input.fileResults
    .filter(
      (result) =>
        result.status === "written" &&
        result.recoveryReadiness === "rollback-ready" &&
        Boolean(result.route?.snapshotReceipt?.snapshotId),
    )
    .map((result) => ({
      targetPath: result.targetPath,
      snapshotId: result.route!.snapshotReceipt!.snapshotId,
    }));
  const ineligibleRollbackTargets = input.fileResults
    .filter(
      (result) =>
        result.status !== "written" ||
        result.recoveryReadiness !== "rollback-ready" ||
        !result.route?.snapshotReceipt?.snapshotId,
    )
    .map((result) => ({
      targetPath: result.targetPath,
      reason:
        result.reason ??
        (result.status === "not-run"
          ? "Target was not attempted."
          : "No rollback-ready snapshot is available for this target."),
    }));

  if (input.status === "written") {
    return {
      status: "not-needed",
      eligibleRollbackTargets,
      ineligibleRollbackTargets,
      requiredConfirmation: "explicit-rollback-apply",
      safeSnapshotIds: eligibleRollbackTargets.flatMap((target) =>
        target.snapshotId ? [target.snapshotId] : [],
      ),
      recommendation: "No recovery needed after target-set success.",
      doNext: "Review the changed files if desired.",
      automaticRollback: false,
      atomicRollback: false,
      evidence: baseEvidence(input, "not-needed", eligibleRollbackTargets.length),
    };
  }

  if (eligibleRollbackTargets.length === 0) {
    return {
      status: "unavailable",
      eligibleRollbackTargets,
      ineligibleRollbackTargets,
      requiredConfirmation: "explicit-rollback-apply",
      safeSnapshotIds: [],
      recommendation:
        "No changed rollback-ready target is available; inspect failed targets before retrying.",
      doNext: "Fix the blocked target-set inputs or retry after resolving the failure.",
      automaticRollback: false,
      atomicRollback: false,
      evidence: baseEvidence(input, "unavailable", 0),
    };
  }

  const recoveryPlanId = `target-set-recovery-${input.transactionId}`;
  return {
    status: "available",
    eligibleRollbackTargets,
    ineligibleRollbackTargets,
    requiredConfirmation: "explicit-rollback-apply",
    recoveryPlanId,
    safeSnapshotIds: eligibleRollbackTargets.flatMap((target) =>
      target.snapshotId ? [target.snapshotId] : [],
    ),
    recommendation:
      "Explicit snapshot-backed recovery apply is available for changed files only.",
    doNext:
      "Confirm the listed snapshot ids and target paths before invoking recovery apply.",
    automaticRollback: false,
    atomicRollback: false,
    evidence: baseEvidence(input, "available", eligibleRollbackTargets.length),
  };
}

function baseEvidence(
  input: {
    readonly transactionId: string;
    readonly manifestId: string;
  },
  status: TargetSetEditRecoveryWorkflow["status"],
  eligibleCount: number,
): readonly string[] {
  return [
    `target-set-edit-recovery-workflow:transaction:${input.transactionId}`,
    `target-set-edit-recovery-workflow:manifest:${input.manifestId}`,
    `target-set-edit-recovery-workflow:status:${status}`,
    `target-set-edit-recovery-workflow:eligible-count:${eligibleCount}`,
    "target-set-edit-recovery-workflow:explicit-confirmation-required",
    "target-set-edit-recovery-workflow:no-automatic-rollback",
    "target-set-edit-recovery-workflow:no-atomic-rollback",
    "target-set-edit-recovery-workflow:raw-content-excluded",
  ];
}
