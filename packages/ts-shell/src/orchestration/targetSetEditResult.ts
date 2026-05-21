import { mapTerminalToOrchestrationResult } from "../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../core/query/runtimeState.js";
import type { QueryTerminal } from "../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";
import type { TargetSetEditRoute } from "./targetSetEditRoute.js";

export function buildTargetSetEditRouteResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: TargetSetEditRoute;
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

function buildCodingResult(route: TargetSetEditRoute): CodingResultSummary {
  const success = route.status === "written";
  const attemptedFiles = route.fileResults.map((result) => result.targetPath);
  const failedFiles = route.failedFiles.map((failure) => ({ ...failure }));
  return {
    taskKind: "edit-file",
    changedFiles: [...route.changedFiles],
    failedFiles,
    patches: route.fileResults.map((result) =>
      result.status === "written"
        ? {
            path: result.targetPath,
            operation: "replace",
            status: "applied",
          }
        : {
            path: result.targetPath,
            operation: "replace",
            status: "failed",
            failureCode: patchFailureCode(route.status),
            reason: result.reason ?? route.nextAction,
          },
    ),
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [
        "target-set exact fenced replacement route only; no automatic rollback was attempted.",
      ],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [
        `target-set-edit manifest=${route.manifestId}`,
        `target-set-edit status=${route.status}`,
        `target-set-edit changed=${route.changedFiles.join(", ") || "none"}`,
        `target-set-edit failed=${failedFiles.map((file) => file.path).join(", ") || "none"}`,
        ...route.fileResults.map(
          (result) =>
            `target-set-edit file=${result.targetPath}; state=${result.status}; rollback=${result.recoveryReadiness}`,
        ),
        ...route.evidence,
        "target-set-edit-result:continuation-safe",
        "target-set-edit-result:raw-content-excluded",
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [...route.changedFiles],
      attemptedFiles,
      changedFiles: [...route.changedFiles],
      unchangedAttemptedFiles: attemptedFiles.filter(
        (target) => !route.changedFiles.includes(target),
      ),
    },
    taskSatisfaction: {
      verdict: success ? "satisfied" : "completed-with-caveats",
      reasons: [route.nextAction],
      requiredEvidence: [
        "explicit confirmed target set",
        "max-file guard",
        "preflight all targets before mutation",
        "per-file workspace authority",
        "per-file final stale-read",
        "per-file pre-write snapshot",
        "per-file post-write verification",
        "partial-failure and rollback-readiness evidence",
      ],
      observedEvidence: [...route.evidence],
    },
    verifiedFiles: success ? [...route.changedFiles] : [],
    unverifiedFiles: failedFiles,
    verification: success
      ? {
          status: "passed",
          reason:
            "Every target-set exact fenced replacement passed post-write verification.",
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
        }
      : {
          status: "failed",
          reason: route.nextAction,
          blockerKind: "unknown",
          nextAction: route.nextAction,
        },
    evidence: [
      ...route.evidence,
      "target-set-edit-result:operation:exact-fenced-replacement",
      `target-set-edit-result:state:${success ? "changed" : route.status}`,
      route.status === "preflight-stopped"
        ? "target-set-edit-result:coding-result-blocked"
        : route.status === "written"
          ? "target-set-edit-result:coding-result-success"
          : "target-set-edit-result:coding-result-partial-failure",
      "target-set-edit-result:raw-content-excluded",
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      changedFiles: [...route.changedFiles],
      verifiedFiles: success ? [...route.changedFiles] : [],
      verification: success
        ? {
            status: "passed",
            reason:
              "Every target-set exact fenced replacement passed post-write verification.",
          }
        : {
            status: "failed",
            reason: route.nextAction,
            blockerKind: "unknown",
          },
      ...(success
        ? {}
        : {
            reason: route.nextAction,
            blockerKind: "unknown" as const,
            writerStarted: route.changedFiles.length > 0,
            writeEffect: route.changedFiles.length > 0 ? ("unverified" as const) : ("none" as const),
            requiresUserInspection: route.changedFiles.length > 0,
          }),
    },
    ...(route.status === "written"
      ? {}
      : { failureBoundary: `target-set-edit-${route.status}` }),
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly route: TargetSetEditRoute;
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
        "target-set edit result consumed Edit/Patch owned route output.",
        `target-set edit status=${input.route.status}`,
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

function buildTerminalInput(route: TargetSetEditRoute): QueryTerminal {
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
    terminalClassification: route.terminalClassification,
    stopReason: route.nextAction,
  };
}

function buildOutput(route: TargetSetEditRoute): string {
  const fileLines = route.fileResults.length
    ? route.fileResults.map(
        (result) =>
          `- ${result.targetPath}: ${result.status}; rollback=${result.recoveryReadiness}`,
      )
    : ["- (none)"];
  return [
    route.status === "written"
      ? "target-set exact fenced replacement succeeded."
      : route.status === "preflight-stopped"
        ? "target-set exact fenced replacement stopped before mutation."
        : "target-set exact fenced replacement partially failed.",
    `Manifest: ${route.manifestId}`,
    `Changed: ${route.changedFiles.join(", ") || "none"}`,
    `Failed: ${route.failedFiles.map((file) => file.path).join(", ") || "none"}`,
    "Files:",
    ...fileLines,
    "Rollback: explicit-only; automatic rollback=no; atomic rollback=no",
    `Verification: ${route.postWriteVerification}`,
    `Next: ${route.nextAction}`,
  ].join("\n");
}

function patchFailureCode(status: TargetSetEditRoute["status"]): CodingPatchFailureCode {
  switch (status) {
    case "preflight-stopped":
      return "patch-generation-failed";
    case "partial-failure":
    case "failed":
      return "write-failed";
    case "written":
      return "write-failed";
  }
}
