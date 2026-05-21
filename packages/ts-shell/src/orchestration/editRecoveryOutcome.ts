import type { RestorePrimitiveBlockedReason } from "./patchRecovery/restorePrimitive.js";

export type EditRecoveryOutcomeState =
  | "edit-recovery-plan-created"
  | "edit-rollback-success"
  | "edit-rollback-stopped-missing-snapshot"
  | "edit-rollback-stopped-missing-target"
  | "edit-rollback-stopped-ambiguous-target"
  | "edit-rollback-stopped-out-of-workspace"
  | "edit-rollback-stopped-stale-target"
  | "edit-rollback-stopped-confirmation-required"
  | "edit-rollback-stopped-not-supported"
  | "edit-rollback-partial-failure"
  | "edit-rollback-failed";

export interface EditRecoveryOutcome {
  readonly state: EditRecoveryOutcomeState;
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly mutationRan: boolean;
  readonly rollbackApplied: boolean;
  readonly automaticRollback: false;
  readonly atomicRollback: false;
  readonly verifierMarker: string;
  readonly evidence: readonly string[];
}

export function buildEditRecoveryOutcome(input: {
  readonly state: EditRecoveryOutcomeState;
  readonly mutationRan?: boolean;
  readonly rollbackApplied?: boolean;
}): EditRecoveryOutcome {
  const terminalClassification =
    input.state === "edit-rollback-success"
      ? "success"
      : input.state === "edit-rollback-partial-failure" ||
          input.state === "edit-rollback-failed"
        ? "error"
        : "stopped";
  const mutationRan = input.mutationRan ?? input.state === "edit-rollback-success";
  const rollbackApplied =
    input.rollbackApplied ?? input.state === "edit-rollback-success";
  return {
    state: input.state,
    terminalClassification,
    mutationRan,
    rollbackApplied,
    automaticRollback: false,
    atomicRollback: false,
    verifierMarker: `edit-recovery-outcome:${input.state}`,
    evidence: [
      `edit-recovery-outcome:${input.state}`,
      `edit-recovery-outcome:terminal:${terminalClassification}`,
      `edit-recovery-outcome:mutation-ran:${mutationRan}`,
      `edit-recovery-outcome:rollback-applied:${rollbackApplied}`,
      "edit-recovery-outcome:no-automatic-rollback",
      "edit-recovery-outcome:no-atomic-rollback",
      "edit-recovery-outcome:raw-content-excluded",
    ],
  };
}

export function stoppedOutcomeForBlocker(
  blocker: string | undefined,
): EditRecoveryOutcomeState {
  switch (blocker) {
    case "missing-snapshot":
    case "record-not-found":
      return "edit-rollback-stopped-missing-snapshot";
    case "missing-target":
    case "target-missing":
      return "edit-rollback-stopped-missing-target";
    case "ambiguous-target":
      return "edit-rollback-stopped-ambiguous-target";
    case "out-of-workspace":
    case "workspace-boundary":
    case "invalid-workspace-relative-path":
      return "edit-rollback-stopped-out-of-workspace";
    case "stale-target":
    case "current-state-mismatch":
    case "current-content-hash-mismatch":
      return "edit-rollback-stopped-stale-target";
    case "confirmation-required":
      return "edit-rollback-stopped-confirmation-required";
    default:
      return "edit-rollback-stopped-not-supported";
  }
}

export function outcomeForRestoreBlocker(
  blocker: RestorePrimitiveBlockedReason | undefined,
): EditRecoveryOutcomeState {
  return stoppedOutcomeForBlocker(blocker);
}
