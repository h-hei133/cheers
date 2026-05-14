import { mapTerminalToOrchestrationResult } from "../../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../../core/query/runtimeState.js";
import type { QueryTerminal } from "../../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "../types.js";
import { projectMutationVerificationHandoff } from "./mutationVerificationProjection.js";
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
  const target = route.targetPath ?? route.sourcePath ?? "(apply_patch)";
  const aggregateFailureTarget = "(apply_patch)";
  const reason = route.nextAction;
  const aggregateFailedFiles = [{ path: aggregateFailureTarget, reason }];
  const perFileFailedFiles = buildPerFileFailedFiles(route, target, reason);
  const handoff = projectMutationVerificationHandoff({
    changedFiles: [],
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
    ...(route.perFilePatchPlan
      ? {
          perFilePatchPlan: projectPerFilePatchResult({
            plan: route.perFilePatchPlan,
            changedFiles: [],
            failedFiles: perFileFailedFiles,
            writerInvoked: false,
            creatorInvoked: false,
            deleteMoveInvoked: route.deleteMoveInvoked,
            postWriteVerification: route.postWriteVerification,
          }),
        }
      : {}),
    changedFiles: [],
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
      notes: [
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
      postRunDirtyFiles: [],
      attemptedFiles: [aggregateFailureTarget],
      changedFiles: [],
      unchangedAttemptedFiles: [aggregateFailureTarget],
    },
    taskSatisfaction: {
      verdict: handoff.taskVerdict,
      reasons: [...handoff.taskReasons],
      requiredEvidence: [
        "blocked workspace move route must not display write success",
        "blocked workspace move route must not report changed files",
        "delete/move writer flag must remain false when no move writer ran",
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
      "apply-patch-workspace-move-result:changed-files-empty",
      "apply-patch-workspace-move-result:no-write-success",
      "apply-patch-workspace-move-result:no-delete-move-invoked",
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
  return {
    action: "terminal",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason: route.nextAction,
  };
}

function buildOutput(route: WorkspaceMoveRoute): string {
  return [
    "apply_patch workspace move blocked before success.",
    "Changed: none",
    `Move writer: ${route.deleteMoveInvoked ? "invoked" : "not invoked"}`,
    `Reason: ${route.nextAction}`,
    `Next: ${route.nextAction}`,
  ].join("\n");
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
