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
import {
  projectPerFilePatchResult,
  type PerFilePatchFailureClass,
} from "./perFilePatchPlan.js";
import type { MultiFileWriteRoute } from "./multiFileWriteRoute.js";

export function buildMultiFileWriteRouteResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: MultiFileWriteRoute;
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

function buildCodingResult(route: MultiFileWriteRoute): CodingResultSummary {
  if (route.status === "written") {
    const targetCount = route.targetPaths.length;
    const reason =
      `${targetCount}-file workspace update completed after explicit approval, final freshness checks for all files, sequential writes, and per-file post-write verification.`;
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
      targetPath: route.targetPaths.join(", "),
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
              routeId: "multi-file-apply-patch-workspace-write",
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
        evidence: ["apply-patch-multi-file-write-result:no-continuation"],
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
          `approved-for-write decision naming exactly ${targetCount} files`,
          "final stale-read for all files before writer",
          "sequential write without rollback claim",
          "per-file post-write verification",
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
        "apply-patch-multi-file-write-result:coding-result-success",
      ],
      lastActionResultSeed: {
        actionKind: "edit-file",
        target: route.targetPaths.join(", "),
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
            taskId: "multi-file-apply-patch-workspace-write",
          },
        ],
        toolExecutions: [
          {
            kind: "executed-succeeded",
            source: "tool-runtime",
            legacySuccess: true,
            toolName: "apply_patch",
            taskId: "multi-file-apply-patch-workspace-write",
          },
        ],
      },
    };
  }

  const target =
    ("targetPath" in route ? route.targetPath : undefined) ??
    route.failedFiles[0]?.path ??
    route.targetPaths[0];
  const reason = route.nextAction;
  const writerStarted = route.writeFailureState.writerStarted;
  const writeEffect = route.writeFailureState.writeEffect;
  const failedFiles = route.failedFiles.map((failure) => ({
    path: failure.path ?? "(apply_patch)",
    reason: failure.message,
  }));
  const handoff = projectMutationVerificationHandoff({
    changedFiles: route.changedFiles,
    failedFiles,
    verification: {
      status: "blocked",
      reason,
      ...(route.status === "blocked" && route.blocker === "write-decision"
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
  const verifiedFiles = [...handoff.changedFiles];
  const unverifiedFiles = route.failedFiles
    .filter((failure) => failure.path)
    .map((failure) => ({
      path: failure.path!,
      reason: failure.message,
    }));
  const recoveryNote = writerStarted
    ? "Writer started in the multi-file route. Inspect/re-read all attempted files before retrying; no rollback was attempted."
    : "No workspace writer ran before this route stopped.";

  return {
    taskKind: "edit-file",
    ...("recoveryAuthorityCapture" in route && route.recoveryAuthorityCapture
      ? {
          recoverySurface: projectRecoverySurfaceSummary({
            routeId: "multi-file-apply-patch-workspace-write",
            recoveryAuthorityCapture: route.recoveryAuthorityCapture,
          }),
        }
      : {}),
    ...(route.perFilePatchPlan
      ? {
          perFilePatchPlan: projectPerFilePatchFailureResultWithJournal({
            routeId: "multi-file-apply-patch-workspace-write",
            plan: route.perFilePatchPlan,
            changedFiles: route.changedFiles,
            failedFiles,
            writerStarted,
            writerInvoked: route.workspaceWriterInvoked,
            creatorInvoked: false,
            deleteMoveInvoked: false,
            postWriteVerification: route.postWriteVerification,
            runtimeFailureClass:
              route.status === "blocked"
                ? failureClassForMultiFileWriteBlocker(route)
                : undefined,
          }),
        }
      : {}),
    changedFiles: [...handoff.changedFiles],
    failedFiles: [...handoff.failedFiles],
    patches: route.failedFiles.map((failure) => ({
      path: failure.path ?? "(apply_patch)",
      operation: "replace" as const,
      status: "failed" as const,
      failureCode: handoff.patchFailureCode,
      reason: failure.message,
    })),
    repair: {
      status: writerStarted ? "failed" : "not-needed",
      attempts: writerStarted ? 1 : 0,
      recoveredItems: [],
      failedItems: writerStarted ? unverifiedFiles.map((file) => file.path) : [],
      notes: [
        recoveryNote,
        "multi-file workspace write route only; no automatic repair or rollback was attempted in this lane.",
      ],
    },
    continuation: {
      status: writerStarted
        ? "failed-after-bounded-continuation"
        : "first-pass-success",
      attempts: writerStarted ? 1 : 0,
      evidence: [
        writerStarted
          ? "apply-patch-multi-file-write-result:writer-started-stopped"
          : "apply-patch-multi-file-write-result:no-continuation",
        `apply-patch-multi-file-write-result:write-effect:${writeEffect}`,
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [...verifiedFiles],
      attemptedFiles:
        route.writeIntents.length > 0
          ? [...route.writeIntents]
          : [...route.targetPaths],
      changedFiles: [...verifiedFiles],
      unchangedAttemptedFiles: route.targetPaths.filter(
        (file) => !verifiedFiles.includes(file),
      ),
    },
    taskSatisfaction: {
      verdict: handoff.taskVerdict,
      reasons: [...handoff.taskReasons],
      requiredEvidence: [
        "blocked or partial multi-file route must not display write success",
        "changedFiles may contain only verified writes",
        "failedFiles must name file-level failures when present",
        ...(writerStarted
          ? ["partial write failure must require current-file inspection"]
          : []),
      ],
      observedEvidence: [...route.evidence],
    },
    verifiedFiles,
    unverifiedFiles,
    verification: {
      status: "blocked",
      reason,
      blockerKind: handoff.verificationBlockerKind,
      nextAction: route.nextAction,
    },
    evidence: [
      ...route.evidence,
      ...handoff.actionableEvidence,
      "apply-patch-multi-file-write-result:coding-result-blocked",
      ...(verifiedFiles.length === 0
        ? ["apply-patch-multi-file-write-result:changed-files-empty"]
        : ["apply-patch-multi-file-write-result:changed-files-verified-only"]),
      "apply-patch-multi-file-write-result:no-write-success",
      "apply-patch-multi-file-write-result:no-rollback",
      `apply-patch-multi-file-write-result:write-effect:${writeEffect}`,
      ...(writerStarted
        ? [
            "apply-patch-multi-file-write-result:writer-started-no-success",
            "apply-patch-multi-file-write-result:user-inspection-required",
          ]
        : []),
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      ...(target ? { target } : {}),
      changedFiles: [...verifiedFiles],
      verifiedFiles,
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
    failureBoundary: `multi-file-apply-patch-workspace-write-${route.blocker}`,
    provenance: {
      approvalDecisions: [
        {
          kind:
            route.status === "blocked" && route.blocker === "write-decision"
              ? "denied"
              : route.approval.status === "approved-for-write"
                ? "approved"
                : "skipped",
          source: "tool-result-metadata",
          legacyOutcome:
            route.approval.status === "approved-for-write" ? "approved" : "denied",
          toolName: "apply_patch",
          taskId: "multi-file-apply-patch-workspace-write",
        },
      ],
      toolExecutions: [
        {
          kind: writerStarted ? "executed-failed" : "permission-blocked",
          source: writerStarted ? "tool-runtime" : "approval-flow",
          legacySuccess: false,
          toolName: "apply_patch",
          taskId: "multi-file-apply-patch-workspace-write",
          failureBoundary: `multi-file-apply-patch-workspace-write-${route.blocker}`,
        },
      ],
    },
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: MultiFileWriteRoute;
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
        "apply_patch multi-file workspace write result consumed guarded route output only.",
        `apply_patch multi-file workspace write status=${input.route.status}`,
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

function buildTerminalInput(route: MultiFileWriteRoute): QueryTerminal {
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

function buildOutput(route: MultiFileWriteRoute): string {
  if (route.status === "written") {
    return [
      "apply_patch multi-file workspace write succeeded.",
      `Changed: ${route.changedFiles.join(", ")}`,
      "Writer: selected-workspace",
      "Verified: each written file matched the approved Update File content",
      "Rollback: not attempted",
      `Next: ${route.nextAction}`,
    ].join("\n");
  }

  return [
    "apply_patch multi-file workspace write stopped before success.",
    `Changed: ${route.changedFiles.length > 0 ? route.changedFiles.join(", ") : "none"}`,
    `Failed: ${route.failedFiles.map((failure) => failure.path ?? "(apply_patch)").join(", ") || "none"}`,
    `Write effect: ${route.writeEffect}`,
    "Rollback: not attempted",
    `Reason: ${route.nextAction}`,
    `Next: ${route.nextAction}`,
  ].join("\n");
}

function failureClassForMultiFileWriteBlocker(
  route: Extract<MultiFileWriteRoute, { status: "blocked" }>,
): PerFilePatchFailureClass | undefined {
  switch (route.blocker) {
    case "final-stale-read":
      return "stale-read";
    case "write-application":
      return route.changedFiles.length > 0 ? "partial-failure" : "write-application";
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
    notes: [
      "multi-file workspace write route only; no repair or rollback was attempted in this lane.",
    ],
  };
}
