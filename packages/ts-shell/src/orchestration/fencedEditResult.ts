import { mapTerminalToOrchestrationResult } from "../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../core/query/runtimeState.js";
import type { QueryTerminal } from "../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";
import type { FencedEditReplacementRoute } from "./fencedEditRoute.js";

export function buildFencedEditReplacementRouteResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: FencedEditReplacementRoute;
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

function buildCodingResult(route: FencedEditReplacementRoute): CodingResultSummary {
  const target = route.targetPath ?? "(fenced replacement)";
  const success = route.status === "written";
  const reason = success
    ? "Exact fenced replacement completed after workspace authority, final stale-read, and post-write verification."
    : route.nextAction;
  const blocker = success ? undefined : route.blocker;
  return {
    taskKind: "edit-file",
    changedFiles: success ? [...route.changedFiles] : [],
    failedFiles: success ? [] : [{ path: target, reason }],
    patches: [
      success
        ? {
            path: target,
            operation: "replace",
            status: "applied",
            changedLines: route.plan.ok ? route.plan.changedLines : undefined,
            addedLines: route.plan.ok ? route.plan.addedLines : undefined,
            removedLines: route.plan.ok ? route.plan.removedLines : undefined,
          }
        : {
            path: target,
            operation: "replace",
            status: "failed",
            failureCode: patchFailureCode(blocker),
            reason,
          },
    ],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: ["fenced replacement route only; no repair was attempted."],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [
        "fenced-edit-result:continuation-safe",
        `fenced-edit-result:operation:fenced-replacement`,
        `fenced-edit-result:state:${success ? "changed" : "stopped"}`,
        ...(blocker ? [`fenced-edit-result:blocker:${blocker}`] : []),
        "fenced-edit-result:raw-content-excluded",
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: success ? [...route.changedFiles] : [],
      attemptedFiles: route.targetPath ? [route.targetPath] : [],
      changedFiles: success ? [...route.changedFiles] : [],
      unchangedAttemptedFiles: success ? [] : route.targetPath ? [route.targetPath] : [],
    },
    taskSatisfaction: {
      verdict: success ? "satisfied" : "insufficient-evidence",
      reasons: [reason],
      requiredEvidence: [
        "one explicit in-workspace target",
        "exact old/new fenced mapping",
        "workspace authority",
        "final stale-read",
        "post-write verification",
      ],
      observedEvidence: [...route.evidence],
    },
    verifiedFiles: success ? [...route.changedFiles] : [],
    unverifiedFiles: success ? [] : [{ path: target, reason }],
    verification: success
      ? {
          status: "passed",
          reason:
            "Post-write verification confirmed the exact fenced replacement content.",
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
        }
      : {
          status: "blocked",
          reason,
          blockerKind: "unknown",
          nextAction: reason,
        },
    evidence: [
      ...route.evidence,
      "fenced-edit-result:operation:fenced-replacement",
      success
        ? "fenced-edit-result:coding-result-success"
        : "fenced-edit-result:coding-result-blocked",
      "fenced-edit-result:raw-content-excluded",
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      ...(route.targetPath ? { target: route.targetPath } : {}),
      changedFiles: success ? [...route.changedFiles] : [],
      verifiedFiles: success ? [...route.changedFiles] : [],
      verification: success
        ? {
            status: "passed",
            reason:
              "Post-write verification confirmed the exact fenced replacement content.",
          }
        : {
            status: "blocked",
            reason,
            ...(blocker ? { blockerKind: "unknown" as const } : {}),
          },
      ...(blocker ? { reason, blockerKind: "unknown" as const } : {}),
    },
    ...(success
      ? {
          provenance: {
            approvalDecisions: [
              {
                kind: "approved",
                source: "tool-result-metadata",
                legacyOutcome: "approved",
                toolName: "apply_patch",
                taskId: "fenced-edit-replacement",
              },
            ],
            toolExecutions: [
              {
                kind: "executed-succeeded",
                source: "tool-runtime",
                legacySuccess: true,
                toolName: "apply_patch",
                taskId: "fenced-edit-replacement",
              },
            ],
          },
        }
      : {}),
    ...(blocker ? { failureBoundary: `fenced-edit-replacement-${blocker}` } : {}),
  };
}

function patchFailureCode(blocker: string | undefined): CodingPatchFailureCode {
  if (!blocker) {
    return "write-failed";
  }
  if (blocker.includes("missing-target") || blocker.includes("target-missing")) {
    return "patch-target-missing";
  }
  if (blocker.includes("mapping-not-found")) {
    return "patch-from-not-found";
  }
  if (
    blocker.includes("multiple-matches") ||
    blocker.includes("ambiguous-target")
  ) {
    return "patch-ambiguous";
  }
  if (blocker.includes("stale-read")) {
    return "stale-read";
  }
  if (blocker.includes("post-write-verification")) {
    return "readback-mismatch";
  }
  return "patch-generation-failed";
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: FencedEditReplacementRoute;
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
        "fenced edit replacement result consumed Edit/Patch owned route output.",
        `fenced edit replacement status=${input.route.status}`,
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

function buildTerminalInput(route: FencedEditReplacementRoute): QueryTerminal {
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

function buildOutput(route: FencedEditReplacementRoute): string {
  if (route.status === "written") {
    return [
      "fenced replacement succeeded.",
      `Changed: ${route.changedFiles.join(", ")}`,
      "Verified: post-write content matched exact fenced replacement",
    ].join("\n");
  }
  return [
    "fenced replacement stopped before success.",
    "Changed: none",
    `Reason: ${route.nextAction}`,
  ].join("\n");
}
