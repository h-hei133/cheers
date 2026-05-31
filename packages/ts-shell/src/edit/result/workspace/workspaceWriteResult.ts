import { mapTerminalToOrchestrationResult } from "../../../core/query/mapping/mapper.js";
import type { QueryRuntimeState } from "../../../core/query/runtime/state.js";
import type { QueryTerminal } from "../../../core/query/runtime/transitions.js";
import { createEmptyLifecycleIndex } from "../../../core/tools/toolResultLifecycle.js";
import { projectRecoverySurfaceSummary } from "../../../orchestration/patchRecovery/recoverySurfaceProjection.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "../../../orchestration/types.js";
import { projectPerFilePatchFailureResultWithJournal } from "../journal/journalFailureConsumer.js";
import { projectMutationVerificationHandoff } from "../../../verification/result/mutationVerificationProjection.js";
import {
  projectPerFilePatchResult,
  type PerFilePatchFailureClass,
} from "../../../orchestration/patchResult/perFilePatchPlan.js";
import type { WorkspaceWriteRoute } from "../../../orchestration/patchResult/workspaceWriteRoute.js";

export function buildWorkspaceWriteRouteResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: WorkspaceWriteRoute;
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

function buildCodingResult(route: WorkspaceWriteRoute): CodingResultSummary {
  if (route.status === "written") {
    const handoff = projectMutationVerificationHandoff({
      changedFiles: route.changedFiles,
      failedFiles: [],
      verification: {
        status: "passed",
        reason:
          "Single-file workspace update completed after final freshness preflight and post-write verification.",
        selectionScope: "focused",
        selectionSource: "auto-from-changes",
      },
      evidence: route.evidence,
      targetPath: route.targetPath,
      reason:
        "Single-file workspace update completed after final freshness preflight and post-write verification.",
      writerStarted: route.writerStarted,
      writeEffect: route.writeEffect,
      postWriteVerification: route.postWriteVerification,
    });
    return {
      taskKind: "edit-file",
      ...(route.recoveryAuthorityCapture
        ? {
            recoverySurface: projectRecoverySurfaceSummary({
              routeId: "single-file-apply-patch-workspace-write",
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
              deleteMoveInvoked: false,
              postWriteVerification: route.postWriteVerification,
            }),
          }
        : {}),
      changedFiles: [...handoff.changedFiles],
      failedFiles: [...handoff.failedFiles],
      repair: emptyRepair(),
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: ["apply-patch-workspace-write-result:no-continuation"],
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
          "final stale-read immediately before writer",
          "post-write verification",
        ],
        observedEvidence: [...route.evidence],
      },
      verifiedFiles: [...handoff.changedFiles],
      unverifiedFiles: [],
      verification: {
        status: "passed",
        reason:
          "Single-file workspace update completed after final freshness preflight and post-write verification.",
        selectionScope: "focused",
        selectionSource: "auto-from-changes",
      },
      evidence: [
        ...route.evidence,
        "apply-patch-workspace-write-result:coding-result-success",
      ],
      lastActionResultSeed: {
        actionKind: "edit-file",
        target: route.targetPath,
        changedFiles: [...handoff.changedFiles],
        verifiedFiles: [...handoff.changedFiles],
        verification: {
          status: "passed",
          reason:
            "Single-file workspace update completed after final freshness preflight and post-write verification.",
        },
      },
      provenance: {
        approvalDecisions: [
          {
            kind: "approved",
            source: "tool-result-metadata",
            legacyOutcome: "approved",
            toolName: "apply_patch",
            taskId: "single-file-apply-patch-workspace-write",
          },
        ],
        toolExecutions: [
          {
            kind: "executed-succeeded",
            source: "tool-runtime",
            legacySuccess: true,
            toolName: "apply_patch",
            taskId: "single-file-apply-patch-workspace-write",
          },
        ],
      },
    };
  }

  const target = route.targetPath ?? route.dryRunRoute?.permissionUx.baseEvidence?.targetPath;
  const reason = route.nextAction;
  const perFileFailedFiles = buildPerFileFailedFiles({
    route,
    target,
    reason,
  });
  const writerStarted = route.writeFailureState.writerStarted;
  const writeEffect = route.writeFailureState.writeEffect;
  const recoveryNote = writerStarted
    ? route.writeFailureState.nextAction
    : "No workspace writer ran before this route stopped.";
  const handoff = projectMutationVerificationHandoff({
    changedFiles: [],
    failedFiles: [
      {
        path: target ?? "(apply_patch)",
        reason,
      },
    ],
    verification: {
      status: "blocked",
      reason,
      ...(route.writeDecision?.status === "denied"
        ? { blockerKind: "approval-denied" as const }
        : {}),
      nextAction: route.nextAction,
    },
    evidence: route.evidence,
    ...(target ? { targetPath: target } : {}),
    reason,
    nextAction: route.nextAction,
    routeBlocker: route.blocker,
    writerStarted,
    writeEffect,
    postWriteVerification: route.postWriteVerification,
  });
  return {
    taskKind: "edit-file",
    ...(route.recoveryAuthorityCapture
      ? {
          recoverySurface: projectRecoverySurfaceSummary({
            routeId: "single-file-apply-patch-workspace-write",
            recoveryAuthorityCapture: route.recoveryAuthorityCapture,
          }),
        }
      : {}),
    ...(route.perFilePatchPlan
      ? {
          perFilePatchPlan: projectPerFilePatchFailureResultWithJournal({
            routeId: "single-file-apply-patch-workspace-write",
            plan: route.perFilePatchPlan,
            changedFiles: [],
            failedFiles: perFileFailedFiles,
            writerStarted,
            writerInvoked: route.workspaceWriterInvoked,
            creatorInvoked: false,
            deleteMoveInvoked: false,
            postWriteVerification: route.postWriteVerification,
            runtimeFailureClass: failureClassForWorkspaceWriteBlocker(
              route.blocker,
            ),
          }),
        }
      : {}),
    changedFiles: [...handoff.changedFiles],
    failedFiles: [...handoff.failedFiles],
    patches: [
      {
        path: target ?? "(apply_patch)",
        operation: "replace",
        status: "failed",
        failureCode: handoff.patchFailureCode,
        reason,
      },
    ],
    repair: {
      status: writerStarted ? "failed" : "not-needed",
      attempts: writerStarted ? 1 : 0,
      recoveredItems: [],
      failedItems: target && writerStarted ? [target] : [],
      notes: [
        recoveryNote,
        "workspace write route only; no automatic repair was attempted in this lane.",
      ],
    },
    continuation: {
      status: writerStarted
        ? "failed-after-bounded-continuation"
        : "first-pass-success",
      attempts: writerStarted ? 1 : 0,
      evidence: [
        writerStarted
          ? "apply-patch-workspace-write-result:writer-started-stopped"
          : "apply-patch-workspace-write-result:no-continuation",
        `apply-patch-workspace-write-result:write-effect:${writeEffect}`,
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: target ? [target] : [],
      changedFiles: [],
      unchangedAttemptedFiles: target ? [target] : [],
    },
    taskSatisfaction: {
      verdict: handoff.taskVerdict,
      reasons: [...handoff.taskReasons],
      requiredEvidence: [
        "blocked workspace write route must not display write success",
        "blocked workspace write route must not report changed files",
        ...(writerStarted
          ? ["writer-invoked failure must require current-file inspection"]
          : []),
      ],
      observedEvidence: [...route.evidence],
    },
    verifiedFiles: [],
    unverifiedFiles: target ? [{ path: target, reason }] : [],
    verification: {
      status: "blocked",
      reason,
      blockerKind: handoff.verificationBlockerKind,
      nextAction: route.nextAction,
    },
    evidence: [
      ...route.evidence,
      ...handoff.actionableEvidence,
      "apply-patch-workspace-write-result:coding-result-blocked",
      "apply-patch-workspace-write-result:changed-files-empty",
      "apply-patch-workspace-write-result:no-write-success",
      `apply-patch-workspace-write-result:write-effect:${writeEffect}`,
      ...(writerStarted
        ? [
            "apply-patch-workspace-write-result:writer-started-no-success",
            "apply-patch-workspace-write-result:user-inspection-required",
          ]
        : []),
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      ...(target ? { target } : {}),
      changedFiles: [],
      verifiedFiles: [],
      ...(writerStarted
        ? {
            writerStarted,
            writeEffect,
            requiresUserInspection: handoff.requiresUserInspection,
          }
        : {}),
      verification: {
        status: "blocked",
        reason,
        blockerKind: handoff.verificationBlockerKind,
      },
      reason,
      blockerKind: handoff.verificationBlockerKind,
    },
    failureBoundary: `single-file-apply-patch-workspace-write-${route.blocker}`,
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: WorkspaceWriteRoute;
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
        "apply_patch workspace write result consumed guarded route output only.",
        `apply_patch workspace write status=${input.route.status}`,
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

function buildTerminalInput(route: WorkspaceWriteRoute): QueryTerminal {
  if (route.status === "written") {
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

function buildOutput(route: WorkspaceWriteRoute): string {
  if (route.status === "written") {
    return [
      "apply_patch workspace write succeeded.",
      `Changed: ${route.changedFiles.join(", ")}`,
      "Writer: selected-workspace",
      "Verified: post-write content matched approved patch",
      `Next: ${route.nextAction}`,
    ].join("\n");
  }

  return [
    "apply_patch workspace write blocked before success.",
    "Changed: none",
    `Write effect: ${route.writeEffect}`,
    `Reason: ${route.nextAction}`,
    `Next: ${route.nextAction}`,
  ].join("\n");
}

function buildPerFileFailedFiles(input: {
  readonly route: Extract<WorkspaceWriteRoute, { status: "blocked" }>;
  readonly target?: string;
  readonly reason: string;
}): readonly { readonly path: string; readonly reason: string }[] {
  const failures = dedupeFailures([
    ...input.route.failures.map((failure) => ({
      path: failure.path ?? input.target ?? "(apply_patch)",
      reason: failure.message,
    })),
    ...(input.route.perFilePatchPlan?.summary.failedFiles.map((failure) => ({
      path: failure.path ?? input.target ?? "(apply_patch)",
      reason: failure.message,
    })) ?? []),
  ]);
  if (failures.length > 0) {
    return failures;
  }

  if (
    input.route.blocker === "final-stale-read" ||
    input.route.blocker === "write-application" ||
    input.route.blocker === "post-write-verification"
  ) {
    const reason =
      input.route.blocker === "final-stale-read"
        ? `stale-read: ${input.reason}`
        : input.reason;
    return [
      {
        path: input.target ?? "(apply_patch)",
        reason,
      },
    ];
  }

  return [];
}

function dedupeFailures(
  failures: readonly { readonly path: string; readonly reason: string }[],
): readonly { readonly path: string; readonly reason: string }[] {
  const seen = new Set<string>();
  return failures.filter((failure) => {
    const key = `${failure.path}\u0000${failure.reason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function failureClassForWorkspaceWriteBlocker(
  blocker: Extract<WorkspaceWriteRoute, { status: "blocked" }>["blocker"],
): PerFilePatchFailureClass | undefined {
  switch (blocker) {
    case "final-stale-read":
      return "stale-read";
    case "write-application":
      return "write-application";
    case "post-write-verification":
      return "post-write-verification";
    default:
      return undefined;
  }
}

function emptyRepair(): CodingResultSummary["repair"] {
  return {
    status: "not-needed",
    attempts: 0,
    recoveredItems: [],
    failedItems: [],
    notes: ["workspace write route only; no repair was attempted in this lane."],
  };
}
