import { mapTerminalToOrchestrationResult } from "../../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../../core/query/runtimeState.js";
import type { QueryTerminal } from "../../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "../types.js";
import type { NoWriteRuntimeRoute } from "./noWriteRuntimeRoute.js";
import { projectPerFilePatchResult } from "./perFilePatchPlan.js";

export function buildNoWriteRuntimeRouteResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: NoWriteRuntimeRoute;
}): OrchestrationResult {
  const codingResult = buildCodingResult(input.route);
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({
      sessionId: input.sessionId,
      prompt: input.prompt,
      route: input.route,
      codingResult,
    }),
    buildTerminalInput(),
  );
}

function buildCodingResult(route: NoWriteRuntimeRoute): CodingResultSummary {
  const reason = route.nextAction;
  const target = route.targetPath ?? "(apply_patch)";
  const failureCode = failureCodeForRoute(route);
  const evidence = [
    ...route.evidence,
    "apply-patch-runtime-entrypoint:no-write-route-result",
    "apply-patch-runtime-entrypoint:changed-files-empty",
    "apply-patch-runtime-entrypoint:write-intents-empty",
    "apply-patch-runtime-entrypoint:no-writer-invoked",
    "apply-patch-runtime-entrypoint:no-write-success",
    ...actionableBlockerEvidence(route),
  ];

  return {
    taskKind: "edit-file",
    ...(route.perFilePatchPlan
      ? {
          perFilePatchPlan: projectPerFilePatchResult({
            plan: route.perFilePatchPlan,
            changedFiles: [],
            writerInvoked: false,
            creatorInvoked: false,
            deleteMoveInvoked: false,
            postWriteVerification: "not-run",
          }),
        }
      : {}),
    changedFiles: [],
    failedFiles: [{ path: target, reason }],
    patches: [
      {
        path: target,
        operation: "replace",
        status: "failed",
        failureCode,
        reason,
      },
    ],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [target],
      notes: [reason],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [
        "apply-patch-runtime-entrypoint:no-continuation",
        ...route.evidence,
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: route.targetPath ? [route.targetPath] : [],
      changedFiles: [],
      unchangedAttemptedFiles: route.targetPath ? [route.targetPath] : [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [reason],
      requiredEvidence: [
        "explicit runtime opt-in",
        "single-file Update File preview",
        "no writer invocation",
      ],
      observedEvidence: evidence,
    },
    verifiedFiles: [],
    unverifiedFiles: route.targetPath
      ? [
          {
            path: route.targetPath,
            reason,
          },
        ]
      : [],
    verification: {
      status: "blocked",
      reason,
      selectionScope: route.targetPath ? "focused" : "none",
      selectionSource: route.targetPath ? "auto-from-changes" : "not-requested",
      blockerKind: "unknown",
      nextAction: route.nextAction,
    },
    evidence,
    lastActionResultSeed: {
      actionKind: "edit-file",
      ...(route.targetPath ? { target: route.targetPath } : {}),
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
    failureBoundary: `single-file-apply-patch-runtime-${route.status}`,
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: NoWriteRuntimeRoute;
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
        "apply_patch runtime entrypoint consumed safe no-write projection only.",
        `apply_patch runtime entrypoint status=${input.route.status}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: input.route.displayLines.join("\n"),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildTerminalInput(): QueryTerminal {
  return {
    action: "terminal",
    terminalReason: "completed",
    terminalClassification: "success",
  };
}

function failureCodeForRoute(route: NoWriteRuntimeRoute): CodingPatchFailureCode {
  if (route.status === "blocked") {
    return "stale-read";
  }
  return "patch-generation-failed";
}

function actionableBlockerEvidence(route: NoWriteRuntimeRoute): readonly string[] {
  if (route.status === "denied") {
    return ["actionable-blocker-kind:approval-denied"];
  }
  if (route.status === "blocked") {
    return ["actionable-blocker-kind:stale-read"];
  }
  return ["actionable-blocker-kind:patch-generation-failed"];
}
