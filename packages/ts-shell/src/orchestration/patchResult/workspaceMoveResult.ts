import { mapTerminalToOrchestrationResult } from "../../core/query/mapping/mapper.js";
import type { QueryRuntimeState } from "../../core/query/runtime/state.js";
import type { QueryTerminal } from "../../core/query/runtime/transitions.js";
import { createEmptyLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import { projectRecoverySurfaceSummary } from "../patchRecovery/recoverySurfaceProjection.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "../types.js";
import { projectPerFilePatchFailureResultWithJournal } from "../../edit/result/journal/journalFailureConsumer.js";
import { projectMutationVerificationHandoff } from "../../verification/result/mutationVerificationProjection.js";
import { projectPerFilePatchResult } from "./perFilePatchPlan.js";
import type { WorkspaceMoveRoute } from "./workspaceMoveRoute.js";

export function buildWorkspaceMoveRouteResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: WorkspaceMoveRoute;
}): OrchestrationResult {
  const codingResult = buildCodingResult(input.route);
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({
      sessionId: input.sessionId,
      prompt: input.prompt,
      route: input.route,
      codingResult,
    }),
    buildTerminalInput(input.route),
  );
}

function buildCodingResult(route: WorkspaceMoveRoute): CodingResultSummary {
  if (route.status === "moved") {
    const reason =
      "Single-file workspace move completed after final source/target preflight and post-write verification.";
    const handoff = projectMutationVerificationHandoff({
      changedFiles: route.changedFiles,
      failedFiles: [],
      verification: {
        status: "passed",
        reason,
        selectionScope: "focused",
        selectionSource: "auto-from-changes",
      },
      evidence: route.evidence,
      targetPath: route.targetPath,
      reason,
      writerStarted: route.writerStarted,
      writeEffect: route.writeEffect,
      postWriteVerification: route.postWriteVerification,
    });
    return {
      taskKind: "edit-file",
      ...(route.recoveryAuthorityCapture
        ? {
            recoverySurface: projectRecoverySurfaceSummary({
              routeId: "single-file-apply-patch-workspace-move",
              recoveryAuthorityCapture: route.recoveryAuthorityCapture,
            }),
          }
        : {}),
      ...(route.perFilePatchPlan
        ? {
            perFilePatchPlan: projectPerFilePatchResult({
              plan: route.perFilePatchPlan,
              changedFiles: route.changedFiles,
              failedFiles: [],
              writerInvoked: route.workspaceWriterInvoked,
              creatorInvoked: false,
              deleteMoveInvoked: route.deleteMoveInvoked,
              postWriteVerification: route.postWriteVerification,
            }),
          }
        : {}),
      changedFiles: [...handoff.changedFiles],
      failedFiles: [],
      repair: emptyRepair(),
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: ["apply-patch-workspace-move-result:no-continuation"],
      },
      changeSet: {
        gitAware: false,
        preExistingDirtyFiles: [],
        postRunDirtyFiles: [...handoff.changedFiles],
        attemptedFiles: [...route.writeIntents],
        changedFiles: [...handoff.changedFiles],
        unchangedAttemptedFiles: [],
      },
      taskSatisfaction: {
        verdict: handoff.taskVerdict,
        reasons: [...handoff.taskReasons],
        requiredEvidence: [
          "explicit workspace write opt-in",
          "approved-for-write decision",
          "final source and target preflight",
          "post-write move verification",
        ],
        observedEvidence: [...route.evidence],
      },
      verifiedFiles: [...handoff.changedFiles],
      unverifiedFiles: [],
      verification: {
        status: "passed",
        reason,
        selectionScope: "focused",
        selectionSource: "auto-from-changes",
      },
      evidence: [
        ...route.evidence,
        "apply-patch-workspace-move-result:coding-result-success",
      ],
      lastActionResultSeed: {
        actionKind: "edit-file",
        target: route.targetPath,
        changedFiles: [...handoff.changedFiles],
        verifiedFiles: [...handoff.changedFiles],
        verification: {
          status: "passed",
          reason,
        },
      },
      provenance: {
        approvalDecisions: [
          {
            kind: "approved",
            source: "tool-result-metadata",
            legacyOutcome: "approved",
            toolName: "apply_patch",
            taskId: "single-file-apply-patch-workspace-move",
          },
        ],
        toolExecutions: [
          {
            kind: "executed-succeeded",
            source: "tool-runtime",
            legacySuccess: true,
            toolName: "apply_patch",
            taskId: "single-file-apply-patch-workspace-move",
          },
        ],
      },
    };
  }

  const target = route.targetPath ?? route.sourcePath ?? "(apply_patch)";
  const aggregateFailureTarget = "(apply_patch)";
  const reason = route.nextAction;
  const changedFiles = [...route.changedFiles];
  const attemptedFiles =
    route.writeIntents.length > 0 ? [...route.writeIntents] : [aggregateFailureTarget];
  const unchangedAttemptedFiles = attemptedFiles.filter(
    (attemptedFile) => !changedFiles.includes(attemptedFile),
  );
  const aggregateFailedFiles = [{ path: aggregateFailureTarget, reason }];
  const perFileFailedFiles = buildPerFileFailedFiles(route, target, reason);
  const handoff = projectMutationVerificationHandoff({
    changedFiles,
    failedFiles: aggregateFailedFiles,
    verification: {
      status: "blocked",
      reason,
      ...(route.blocker === "write-decision"
        ? { blockerKind: "approval-denied" as const }
        : {}),
      nextAction: route.nextAction,
    },
    evidence: route.evidence,
    targetPath: target,
    reason,
    nextAction: route.nextAction,
    routeBlocker: route.blocker,
    writerStarted: route.writerStarted,
    writeEffect: route.writeEffect,
    postWriteVerification: route.postWriteVerification,
  });

  return {
    taskKind: "edit-file",
    ...(route.recoveryAuthorityCapture
      ? {
          recoverySurface: projectRecoverySurfaceSummary({
            routeId: "single-file-apply-patch-workspace-move",
            recoveryAuthorityCapture: route.recoveryAuthorityCapture,
          }),
        }
      : {}),
    ...(route.perFilePatchPlan
      ? {
          perFilePatchPlan: projectPerFilePatchFailureResultWithJournal({
            routeId: "single-file-apply-patch-workspace-move",
            plan: route.perFilePatchPlan,
            changedFiles,
            failedFiles: perFileFailedFiles,
            writerStarted: route.writerStarted,
            writerInvoked: route.workspaceWriterInvoked,
            creatorInvoked: false,
            deleteMoveInvoked: route.deleteMoveInvoked,
            postWriteVerification: route.postWriteVerification,
          }),
        }
      : {}),
    changedFiles: [...handoff.changedFiles],
    failedFiles: [...handoff.failedFiles],
    patches: [
      {
        path: aggregateFailureTarget,
        operation: "replace",
        status: "failed",
        failureCode: handoff.patchFailureCode,
        reason,
      },
    ],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [aggregateFailureTarget],
      notes: route.writerStarted
        ? [
            "Workspace move writer started, but the route stopped without a success claim.",
            "workspace move route only; no automatic repair or rollback was attempted in this lane.",
          ]
        : [
            "No workspace move writer ran before this route stopped.",
            "workspace move route only; no automatic repair or rollback was attempted in this lane.",
          ],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [
        "apply-patch-workspace-move-result:no-continuation",
        `apply-patch-workspace-move-result:write-effect:${route.writeEffect}`,
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [...changedFiles],
      attemptedFiles,
      changedFiles: [...changedFiles],
      unchangedAttemptedFiles,
    },
    taskSatisfaction: {
      verdict: handoff.taskVerdict,
      reasons: [...handoff.taskReasons],
      requiredEvidence: [
        "blocked workspace move route must not display write success",
        ...(route.writerStarted
          ? [
              "blocked workspace move route must preserve changed/failed facts when writer already ran",
              "delete/move writer flag must remain true only for an actual move attempt",
            ]
          : [
              "blocked workspace move route must not report changed files",
              "delete/move writer flag must remain false when no move writer ran",
            ]),
      ],
      observedEvidence: [...route.evidence],
    },
    verifiedFiles: [],
    unverifiedFiles: [{ path: aggregateFailureTarget, reason }],
    verification: {
      status: "blocked",
      reason,
      blockerKind: handoff.verificationBlockerKind,
      nextAction: route.nextAction,
    },
    evidence: [
      ...route.evidence,
      ...handoff.actionableEvidence,
      "apply-patch-workspace-move-result:coding-result-blocked",
      ...(changedFiles.length === 0
        ? ["apply-patch-workspace-move-result:changed-files-empty"]
        : ["apply-patch-workspace-move-result:changed-files-preserved-after-writer"]),
      "apply-patch-workspace-move-result:no-write-success",
      ...(route.deleteMoveInvoked
        ? ["apply-patch-workspace-move-result:delete-move-invoked-no-success-claim"]
        : ["apply-patch-workspace-move-result:no-delete-move-invoked"]),
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      target: aggregateFailureTarget,
      changedFiles: [],
      verifiedFiles: [],
      verification: {
        status: "blocked",
        reason,
        blockerKind: handoff.verificationBlockerKind,
      },
      reason,
      blockerKind: handoff.verificationBlockerKind,
    },
    failureBoundary: `single-file-apply-patch-workspace-move-${route.blocker}`,
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: WorkspaceMoveRoute;
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
        "apply_patch workspace move result consumed guarded move route output only.",
        `apply_patch workspace move status=${input.route.status}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: buildOutput(input.route),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildTerminalInput(route: WorkspaceMoveRoute): QueryTerminal {
  if (route.status === "moved") {
    return {
      action: "terminal",
      terminalReason: "completed",
      terminalClassification: "success",
    };
  }
  return {
    action: "terminal",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason: route.nextAction,
  };
}

function buildOutput(route: WorkspaceMoveRoute): string {
  if (route.status === "moved") {
    return [
      "apply_patch workspace move succeeded.",
      `Changed: ${route.changedFiles.join(", ")}`,
      "Move writer: invoked",
      "Verified: source absent and target content matched original source",
      `Next: ${route.nextAction}`,
    ].join("\n");
  }

  return [
    "apply_patch workspace move blocked before success.",
    "Changed: none",
    `Move writer: ${route.deleteMoveInvoked ? "invoked" : "not invoked"}`,
    `Reason: ${route.nextAction}`,
    `Next: ${route.nextAction}`,
  ].join("\n");
}

function emptyRepair(): CodingResultSummary["repair"] {
  return {
    status: "not-needed",
    attempts: 0,
    recoveredItems: [],
    failedItems: [],
    notes: ["workspace move route only; no repair was attempted in this lane."],
  };
}

function buildPerFileFailedFiles(
  route: WorkspaceMoveRoute,
  target: string,
  reason: string,
): readonly { readonly path: string; readonly reason: string }[] {
  const failures = route.failures.map((failure) => ({
    path: failure.path ?? target,
    reason: failure.message,
  }));
  if (failures.length > 0) {
    return failures;
  }
  return [{ path: target, reason }];
}
