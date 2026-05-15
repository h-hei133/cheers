import { mapTerminalToOrchestrationResult } from "../../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../../core/query/runtimeState.js";
import type { QueryTerminal } from "../../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import { projectRecoverySurfaceSummary } from "../patchRecovery/recoverySurfaceProjection.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "../types.js";
import { projectPerFilePatchFailureResultWithJournal } from "./journalFailureConsumer.js";
import { projectMutationVerificationHandoff } from "./mutationVerificationProjection.js";
import { projectPerFilePatchResult } from "./perFilePatchPlan.js";
import type { WorkspaceCreateRoute } from "./workspaceCreateRoute.js";

export function buildWorkspaceCreateRouteResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: WorkspaceCreateRoute;
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

function buildCodingResult(route: WorkspaceCreateRoute): CodingResultSummary {
  if (route.status === "created") {
    const reason =
      "Single-file workspace create completed after exclusive create and post-write readback verification.";
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
      taskKind: "write-file",
      ...(route.recoveryAuthorityCapture
        ? {
            recoverySurface: projectRecoverySurfaceSummary({
              routeId: "single-file-apply-patch-workspace-create",
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
              creatorInvoked: route.workspaceWriterInvoked,
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
        evidence: ["apply-patch-workspace-create-result:no-continuation"],
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
          "exclusive create",
          "post-write verification",
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
        "apply-patch-workspace-create-result:coding-result-success",
      ],
      lastActionResultSeed: {
        actionKind: "write-file",
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
            taskId: "single-file-apply-patch-workspace-create",
          },
        ],
        toolExecutions: [
          {
            kind: "executed-succeeded",
            source: "tool-runtime",
            legacySuccess: true,
            toolName: "apply_patch",
            taskId: "single-file-apply-patch-workspace-create",
          },
        ],
      },
    };
  }

  const target = route.targetPath;
  const reason = route.nextAction;
  const writerStarted = route.writeFailureState.writerStarted;
  const writeEffect = route.writeFailureState.writeEffect;
  const recoveryNote = writerStarted
    ? route.writeFailureState.nextAction
    : "No workspace writer ran before this route stopped.";
  const failedFiles = route.failures.map((failure) => ({
    path: failure.path ?? target ?? "(apply_patch)",
    reason: failure.message,
  }));
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
      ...(route.blocker === "write-decision"
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
    taskKind: "write-file",
    ...(route.recoveryAuthorityCapture
      ? {
          recoverySurface: projectRecoverySurfaceSummary({
            routeId: "single-file-apply-patch-workspace-create",
            recoveryAuthorityCapture: route.recoveryAuthorityCapture,
          }),
        }
      : {}),
    ...(route.perFilePatchPlan
      ? {
          perFilePatchPlan: projectPerFilePatchFailureResultWithJournal({
            routeId: "single-file-apply-patch-workspace-create",
            plan: route.perFilePatchPlan,
            changedFiles: [],
            failedFiles,
            writerStarted,
            writerInvoked: route.workspaceWriterInvoked,
            creatorInvoked: route.workspaceWriterInvoked,
            deleteMoveInvoked: false,
            postWriteVerification: route.postWriteVerification,
          }),
        }
      : {}),
    changedFiles: [...handoff.changedFiles],
    failedFiles: [...handoff.failedFiles],
    repair: {
      status: writerStarted ? "failed" : "not-needed",
      attempts: writerStarted ? 1 : 0,
      recoveredItems: [],
      failedItems: target && writerStarted ? [target] : [],
      notes: [
        recoveryNote,
        "workspace create route only; no automatic repair was attempted in this lane.",
      ],
    },
    continuation: {
      status: writerStarted
        ? "failed-after-bounded-continuation"
        : "first-pass-success",
      attempts: writerStarted ? 1 : 0,
      evidence: [
        writerStarted
          ? "apply-patch-workspace-create-result:writer-started-stopped"
          : "apply-patch-workspace-create-result:no-continuation",
        `apply-patch-workspace-create-result:write-effect:${writeEffect}`,
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
        "blocked workspace create route must not display write success",
        "blocked workspace create route must not report changed files",
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
      "apply-patch-workspace-create-result:coding-result-blocked",
      "apply-patch-workspace-create-result:changed-files-empty",
      "apply-patch-workspace-create-result:no-write-success",
      `apply-patch-workspace-create-result:write-effect:${writeEffect}`,
      ...(writerStarted
        ? [
            "apply-patch-workspace-create-result:writer-started-no-success",
            "apply-patch-workspace-create-result:user-inspection-required",
          ]
        : []),
    ],
    lastActionResultSeed: {
      actionKind: "write-file",
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
    failureBoundary: `single-file-apply-patch-workspace-create-${route.blocker}`,
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: WorkspaceCreateRoute;
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
        "apply_patch workspace create result consumed guarded create route output only.",
        `apply_patch workspace create status=${input.route.status}`,
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

function buildTerminalInput(route: WorkspaceCreateRoute): QueryTerminal {
  if (route.status === "created") {
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

function buildOutput(route: WorkspaceCreateRoute): string {
  if (route.status === "created") {
    return [
      "apply_patch workspace create succeeded.",
      `Changed: ${route.changedFiles.join(", ")}`,
      "Writer: selected-workspace",
      "Verified: post-write content matched approved Add File patch",
      `Next: ${route.nextAction}`,
    ].join("\n");
  }

  return [
    "apply_patch workspace create blocked before success.",
    "Changed: none",
    `Write effect: ${route.writeEffect}`,
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
    notes: ["workspace create route only; no repair was attempted in this lane."],
  };
}
