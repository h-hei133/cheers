import { mapTerminalToOrchestrationResult } from "../../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../../core/query/runtimeState.js";
import type { QueryTerminal } from "../../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "../types.js";
import type { WorkspaceWriteRoute } from "./workspaceWriteRoute.js";

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
    return {
      taskKind: "edit-file",
      changedFiles: [...route.changedFiles],
      failedFiles: [],
      repair: emptyRepair(),
      continuation: {
        status: "first-pass-success",
        attempts: 0,
        evidence: ["apply-patch-workspace-write-result:no-continuation"],
      },
      changeSet: {
        gitAware: false,
        preExistingDirtyFiles: [],
        postRunDirtyFiles: [...route.changedFiles],
        attemptedFiles: [...route.writeIntents],
        changedFiles: [...route.changedFiles],
        unchangedAttemptedFiles: [],
      },
      taskSatisfaction: {
        verdict: "satisfied",
        reasons: [],
        requiredEvidence: [
          "explicit workspace write opt-in",
          "approved-for-write decision",
          "final stale-read immediately before writer",
          "post-write verification",
        ],
        observedEvidence: [...route.evidence],
      },
      verifiedFiles: [...route.changedFiles],
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
        changedFiles: [...route.changedFiles],
        verifiedFiles: [...route.changedFiles],
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
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [
      {
        path: target ?? "(apply_patch)",
        reason,
      },
    ],
    patches: [
      {
        path: target ?? "(apply_patch)",
        operation: "replace",
        status: "failed",
        failureCode: failureCodeForBlockedRoute(route),
        reason,
      },
    ],
    repair: emptyRepair(),
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: ["apply-patch-workspace-write-result:no-continuation"],
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
      verdict: "insufficient-evidence",
      reasons: [reason],
      requiredEvidence: [
        "blocked workspace write route must not display write success",
        "blocked workspace write route must not report changed files",
      ],
      observedEvidence: [...route.evidence],
    },
    verifiedFiles: [],
    unverifiedFiles: target ? [{ path: target, reason }] : [],
    verification: {
      status: "blocked",
      reason,
      blockerKind: "unknown",
      nextAction: route.nextAction,
    },
    evidence: [
      ...route.evidence,
      ...actionableBlockerEvidence(route),
      "apply-patch-workspace-write-result:coding-result-blocked",
      "apply-patch-workspace-write-result:changed-files-empty",
      "apply-patch-workspace-write-result:no-write-success",
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      ...(target ? { target } : {}),
      changedFiles: [],
      verifiedFiles: [],
      verification: {
        status: "blocked",
        reason,
        blockerKind: "unknown",
      },
      reason,
      blockerKind: "unknown",
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
    terminalReason: "completed",
    terminalClassification: "success",
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
    notes: ["workspace write route only; no repair was attempted in this lane."],
  };
}

function failureCodeForBlockedRoute(
  route: Extract<WorkspaceWriteRoute, { status: "blocked" }>,
): CodingPatchFailureCode {
  if (route.blocker === "final-stale-read") {
    return "stale-read";
  }
  return "patch-generation-failed";
}

function actionableBlockerEvidence(
  route: Extract<WorkspaceWriteRoute, { status: "blocked" }>,
): readonly string[] {
  if (route.blocker === "final-stale-read") {
    return ["actionable-blocker-kind:stale-read"];
  }
  return ["actionable-blocker-kind:patch-generation-failed"];
}
