import { mapTerminalToOrchestrationResult } from "../../../core/query/mapping/mapper.js";
import type { QueryRuntimeState } from "../../../core/query/runtime/state.js";
import type { QueryTerminal } from "../../../core/query/runtime/transitions.js";
import { createEmptyLifecycleIndex } from "../../../core/tools/toolResultLifecycle.js";
import type {
  CodingResultSummary,
  OrchestrationResult,
} from "../../../orchestration/types.js";
import type { MultiFileUpdatePlanningClassification } from "./multiFile.js";
import {
  projectPerFilePatchResult,
  type PerFilePatchPlan,
} from "./perFile.js";

export function buildMultiFileUpdatePlanningRouteResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly classification: MultiFileUpdatePlanningClassification;
  readonly perFilePatchPlan?: PerFilePatchPlan;
}): OrchestrationResult {
  const codingResult = buildCodingResult({
    classification: input.classification,
    perFilePatchPlan: input.perFilePatchPlan,
  });
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({
      sessionId: input.sessionId,
      prompt: input.prompt,
      classification: input.classification,
      codingResult,
    }),
    buildTerminalInput(input.classification),
  );
}

function buildCodingResult(input: {
  readonly classification: MultiFileUpdatePlanningClassification;
  readonly perFilePatchPlan?: PerFilePatchPlan;
}): CodingResultSummary {
  const { classification } = input;
  const plannedFiles =
    classification.plannedFiles.length > 0
      ? classification.plannedFiles
      : classification.targetPaths;
  const failedFiles =
    classification.failedFiles.length > 0
      ? classification.failedFiles.map((failure) => ({
          path: failure.path ?? "(apply_patch)",
          reason: failure.message,
        }))
      : plannedFiles.map((path) => ({
          path,
          reason: classification.explanation,
        }));
  const evidence = [
    "apply-patch-three-file-planning:no-write-route",
    `apply-patch-three-file-planning:blocker:${classification.blockedReason}`,
    "apply-patch-three-file-planning:changed-files-empty",
    "apply-patch-three-file-planning:write-intents-empty",
    "apply-patch-three-file-planning:no-writer-invoked",
    "apply-patch-three-file-planning:no-creator-invoked",
    "apply-patch-three-file-planning:no-delete-move",
    "apply-patch-three-file-planning:no-applied-patch-record",
    "apply-patch-three-file-planning:no-success-claim",
  ];

  return {
    taskKind: "edit-file",
    ...(input.perFilePatchPlan
      ? {
          perFilePatchPlan: projectPerFilePatchResult({
            plan: input.perFilePatchPlan,
            changedFiles: [],
            failedFiles: classification.failedFiles.map((failure) => ({
              path: failure.path ?? "(apply_patch)",
              reason: failure.message,
            })),
            writerInvoked: false,
            creatorInvoked: false,
            deleteMoveInvoked: false,
            postWriteVerification: "not-run",
          }),
        }
      : {}),
    changedFiles: [],
    failedFiles,
    patches: failedFiles.map((failure) => ({
      path: failure.path,
      operation: "replace" as const,
      status: "failed" as const,
      failureCode: "patch-generation-failed" as const,
      reason: failure.reason,
    })),
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: ["No workspace writer ran before this planning/no-write route stopped."],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: ["apply-patch-three-file-planning:no-continuation"],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [...plannedFiles],
      changedFiles: [],
      unchangedAttemptedFiles: [...plannedFiles],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [classification.explanation],
      requiredEvidence: [
        "exactly-three existing selected-workspace Update File planning",
        "stopped terminal outcome",
        "changedFiles empty",
        "writeIntents empty",
        "writer unreachable",
      ],
      observedEvidence: evidence,
    },
    verifiedFiles: [],
    unverifiedFiles: plannedFiles.map((path) => ({
      path,
      reason: classification.explanation,
    })),
    verification: {
      status: "blocked",
      reason: classification.explanation,
      selectionScope: "focused",
      selectionSource: "auto-from-changes",
      blockerKind: "unknown",
      nextAction: classification.nextAction,
    },
    evidence,
    lastActionResultSeed: {
      actionKind: "edit-file",
      target: plannedFiles.join(", "),
      changedFiles: [],
      verifiedFiles: [],
      writerStarted: false,
      writeEffect: "none",
      verification: {
        status: "blocked",
        reason: classification.explanation,
        blockerKind: "unknown",
      },
      reason: classification.explanation,
      blockerKind: "unknown",
    },
    failureBoundary: `multi-file-update-planning-${classification.blockedReason}`,
    provenance: {
      approvalDecisions: [
        {
          kind: "skipped",
          source: "tool-result-metadata",
          legacyOutcome: "denied",
          toolName: "apply_patch",
          taskId: "three-file-update-planning-no-write",
        },
      ],
      toolExecutions: [
        {
          kind: "permission-blocked",
          source: "approval-flow",
          legacySuccess: false,
          toolName: "apply_patch",
          taskId: "three-file-update-planning-no-write",
          failureBoundary: `multi-file-update-planning-${classification.blockedReason}`,
        },
      ],
    },
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly classification: MultiFileUpdatePlanningClassification;
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
        "apply_patch exactly-three update planning consumed no-write projection only.",
        `apply_patch exactly-three update planning status=${input.classification.blockedReason}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: buildOutput(input.classification),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildTerminalInput(
  classification: MultiFileUpdatePlanningClassification,
): QueryTerminal {
  return {
    action: "terminal",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason: classification.explanation,
  };
}

function buildOutput(
  classification: MultiFileUpdatePlanningClassification,
): string {
  const plannedFiles =
    classification.plannedFiles.length > 0
      ? classification.plannedFiles
      : classification.targetPaths;
  return [
    "apply_patch exactly-three update planning stopped before write.",
    `Planned: ${plannedFiles.join(", ") || "none"}`,
    "Changed: none",
    "Write effect: none",
    "Writer: not invoked",
    `Reason: ${classification.explanation}`,
    `Next: ${classification.nextAction}`,
  ].join("\n");
}
