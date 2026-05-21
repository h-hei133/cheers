import type { RecoverySurfaceSummary } from "./patchRecovery/recoverySurfaceProjection.js";
import type { EditSnapshotReceipt } from "./editSnapshot.js";
import { mapTerminalToOrchestrationResult } from "../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../core/query/runtimeState.js";
import type { QueryTerminal } from "../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";
import type { EditRecoveryApplyRoute } from "./editRecoveryApply.js";

export type EditRecoverySnapshotState =
  | "snapshot-created"
  | "snapshot-not-needed-no-write"
  | "snapshot-failed-no-mutation";

export type EditRollbackReadiness =
  | "rollback-available"
  | "rollback-not-needed-success"
  | "rollback-not-run"
  | "rollback-not-supported"
  | "rollback-blocked-stale-target"
  | "rollback-failed";

export interface EditRecoveryResult {
  readonly snapshotState: EditRecoverySnapshotState;
  readonly rollbackReadiness: EditRollbackReadiness;
  readonly rollbackPlanProjected: boolean;
  readonly automaticRollback: false;
  readonly terminalSummary: string;
  readonly continuationSummary: string;
  readonly verifierMarker: string;
  readonly evidence: readonly string[];
}

export function projectEditRecoveryResult(input: {
  readonly routeStatus: "written" | "blocked";
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly snapshotReceipt: EditSnapshotReceipt;
  readonly recoverySurface?: RecoverySurfaceSummary;
}): EditRecoveryResult {
  const rollbackReadiness = classifyRollbackReadiness(input);
  const target = input.snapshotReceipt.targetPath ?? "(edit target)";
  return {
    snapshotState: input.snapshotReceipt.status,
    rollbackReadiness,
    rollbackPlanProjected:
      rollbackReadiness === "rollback-available" ||
      Boolean(input.recoverySurface?.explicitRestoreAvailable),
    automaticRollback: false,
    terminalSummary: terminalSummary({
      target,
      snapshotState: input.snapshotReceipt.status,
      rollbackReadiness,
    }),
    continuationSummary: continuationSummary({
      target,
      snapshotState: input.snapshotReceipt.status,
      rollbackReadiness,
    }),
    verifierMarker: `edit-recovery:${rollbackReadiness}`,
    evidence: [
      `edit-recovery-snapshot:${input.snapshotReceipt.status}`,
      `edit-recovery-rollback:${rollbackReadiness}`,
      "edit-recovery:automatic-rollback:false",
      input.recoverySurface?.explicitRestoreAvailable
        ? "edit-recovery:explicit-restore-available"
        : "edit-recovery:explicit-restore-unavailable",
      input.recoverySurface?.atomicRollbackAvailable
        ? "edit-recovery:unexpected-atomic-rollback"
        : "edit-recovery:no-atomic-rollback",
      "edit-recovery:no-raw-content",
    ],
  };
}

export function buildEditRecoveryApplyRouteResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: EditRecoveryApplyRoute;
}): OrchestrationResult {
  const codingResult = buildRecoveryApplyCodingResult(input.route);
  return mapTerminalToOrchestrationResult(
    buildRecoveryApplyRuntimeState({
      sessionId: input.sessionId,
      prompt: input.prompt,
      route: input.route,
      codingResult,
    }),
    buildRecoveryApplyTerminal(input.route),
  );
}

function buildRecoveryApplyCodingResult(
  route: EditRecoveryApplyRoute,
): CodingResultSummary {
  const success = route.status === "rollback-success";
  const attemptedFiles = route.fileResults.map((result) => result.targetPath);
  return {
    taskKind: "edit-file",
    changedFiles: [...route.restoredFiles],
    failedFiles: route.failedFiles.map((failure) => ({ ...failure })),
    patches: route.fileResults.map((result) =>
      result.status === "restored"
        ? {
            path: result.targetPath,
            operation: "replace",
            status: "applied",
          }
        : {
            path: result.targetPath,
            operation: "replace",
            status: "failed",
            failureCode:
              result.reason === "current-content-hash-mismatch" ||
              result.reason === "current-state-mismatch"
                ? "stale-read"
                : "write-failed",
            reason: result.reason ?? route.nextAction,
          },
    ),
    repair: {
      status: success ? "recovered" : "failed",
      attempts: route.outcome.mutationRan ? 1 : 0,
      recoveredItems: [...route.restoredFiles],
      failedItems: route.failedFiles.map((file) => file.path),
      notes: [
        "explicit snapshot-backed rollback apply only; no automatic rollback was attempted.",
      ],
    },
    continuation: {
      status: success ? "recovered-after-continuation" : "failed-after-bounded-continuation",
      attempts: route.outcome.mutationRan ? 1 : 0,
      evidence: [
        `edit-recovery-apply plan=${route.plan.recoveryPlanId}`,
        `edit-recovery-apply status=${route.status}`,
        `edit-recovery-apply restored=${route.restoredFiles.join(", ") || "none"}`,
        `edit-recovery-apply failed=${route.failedFiles.map((file) => file.path).join(", ") || "none"}`,
        ...route.fileResults.map(
          (result) =>
            `edit-recovery-apply file=${result.targetPath}; state=${result.status}; verification=${result.verification}`,
        ),
        ...route.evidence,
        "edit-recovery-result:continuation-safe",
        "edit-recovery-result:raw-content-excluded",
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [...route.restoredFiles],
      attemptedFiles,
      changedFiles: [...route.restoredFiles],
      unchangedAttemptedFiles: attemptedFiles.filter(
        (target) => !route.restoredFiles.includes(target),
      ),
    },
    taskSatisfaction: {
      verdict: success ? "satisfied" : "completed-with-caveats",
      reasons: [route.nextAction],
      requiredEvidence: [
        "explicit snapshot id",
        "explicit target path",
        "workspace authority",
        "current-content guard",
        "post-rollback verification",
        "no automatic rollback",
      ],
      observedEvidence: [...route.evidence],
    },
    verifiedFiles: success ? [...route.restoredFiles] : [],
    unverifiedFiles: route.failedFiles.map((file) => ({ ...file })),
    verification: success
      ? {
          status: "passed",
          reason: "Post-rollback verification matched snapshot metadata.",
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
        }
      : {
          status: route.outcome.mutationRan ? "failed" : "blocked",
          reason: route.nextAction,
          blockerKind: "unknown",
          nextAction: route.nextAction,
        },
    evidence: [
      ...route.evidence,
      "edit-recovery-result:result-surface-compatible",
      success
        ? "edit-recovery-result:coding-result-success"
        : route.outcome.mutationRan
          ? "edit-recovery-result:coding-result-partial-failure"
          : "edit-recovery-result:coding-result-blocked",
      "edit-recovery-result:raw-content-excluded",
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      changedFiles: [...route.restoredFiles],
      verifiedFiles: success ? [...route.restoredFiles] : [],
      verification: success
        ? {
            status: "passed",
            reason: "Post-rollback verification matched snapshot metadata.",
          }
        : {
            status: route.outcome.mutationRan ? "failed" : "blocked",
            reason: route.nextAction,
            blockerKind: "unknown",
          },
      ...(success
        ? {}
        : {
            reason: route.nextAction,
            blockerKind: "unknown" as const,
            writerStarted: route.outcome.mutationRan,
            writeEffect: route.outcome.mutationRan ? ("unverified" as const) : ("none" as const),
            requiresUserInspection: route.outcome.mutationRan,
          }),
    },
    ...(success ? {} : { failureBoundary: `edit-recovery-${route.status}` }),
  };
}

function buildRecoveryApplyRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: EditRecoveryApplyRoute;
  readonly codingResult: CodingResultSummary;
}): QueryRuntimeState {
  return {
    config: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      maxTurns: 1,
      startingRole: "coder",
    },
    currentRole: "coder",
    turn: 1,
    pendingLifecycle: createEmptyLifecycleIndex(),
    sharedContext: {
      sessionId: input.sessionId,
      initialPrompt: input.prompt,
      notes: [
        "edit recovery apply result consumed Edit/Patch owned route output.",
        `edit recovery apply status=${input.route.status}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: buildRecoveryApplyOutput(input.route),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildRecoveryApplyTerminal(route: EditRecoveryApplyRoute): QueryTerminal {
  if (route.status === "rollback-success") {
    return {
      action: "terminal",
      terminalReason: "completed",
      terminalClassification: "success",
    };
  }
  return {
    action: "terminal",
    terminalReason: "stopped_error",
    terminalClassification: route.terminalClassification,
    stopReason: route.nextAction,
  };
}

function buildRecoveryApplyOutput(route: EditRecoveryApplyRoute): string {
  const fileLines = route.fileResults.length
    ? route.fileResults.map(
        (result) =>
          `- ${result.targetPath}: ${result.status}; verification=${result.verification}`,
      )
    : ["- (none)"];
  return [
    route.status === "rollback-success"
      ? "explicit snapshot rollback succeeded."
      : route.status === "rollback-stopped"
        ? "explicit snapshot rollback stopped before mutation."
        : "explicit snapshot rollback failed.",
    `Plan: ${route.plan.recoveryPlanId}`,
    `Restored: ${route.restoredFiles.join(", ") || "none"}`,
    `Failed: ${route.failedFiles.map((file) => file.path).join(", ") || "none"}`,
    "Files:",
    ...fileLines,
    "Rollback: explicit-only; automatic rollback=no; atomic rollback=no",
    `Verification: ${route.postRollbackVerification}`,
    `Next: ${route.nextAction}`,
  ].join("\n");
}

function classifyRollbackReadiness(input: {
  readonly routeStatus: "written" | "blocked";
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly snapshotReceipt: EditSnapshotReceipt;
  readonly recoverySurface?: RecoverySurfaceSummary;
}): EditRollbackReadiness {
  if (input.snapshotReceipt.status === "snapshot-failed-no-mutation") {
    return "rollback-not-supported";
  }
  if (input.snapshotReceipt.status === "snapshot-not-needed-no-write") {
    return "rollback-not-run";
  }
  if (input.routeStatus === "written") {
    return "rollback-not-needed-success";
  }
  if (
    input.terminalClassification === "error" &&
    input.recoverySurface?.explicitRestoreAvailable
  ) {
    return "rollback-available";
  }
  return "rollback-not-run";
}

function terminalSummary(input: {
  readonly target: string;
  readonly snapshotState: EditRecoverySnapshotState;
  readonly rollbackReadiness: EditRollbackReadiness;
}): string {
  if (input.snapshotState === "snapshot-created") {
    return `Snapshot: pre-write receipt captured for ${input.target}; rollback readiness=${input.rollbackReadiness}; automatic rollback=no.`;
  }
  if (input.snapshotState === "snapshot-failed-no-mutation") {
    return `Snapshot: capture failed before mutation; rollback readiness=${input.rollbackReadiness}; automatic rollback=no.`;
  }
  return `Snapshot: not created because no writer ran; rollback readiness=${input.rollbackReadiness}; automatic rollback=no.`;
}

function continuationSummary(input: {
  readonly target: string;
  readonly snapshotState: EditRecoverySnapshotState;
  readonly rollbackReadiness: EditRollbackReadiness;
}): string {
  return `edit recovery target=${input.target}; snapshot=${input.snapshotState}; rollback=${input.rollbackReadiness}; automatic-rollback=false; raw-content-excluded=true`;
}
