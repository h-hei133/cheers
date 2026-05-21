import { mapTerminalToOrchestrationResult } from "../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../core/query/runtimeState.js";
import type { QueryTerminal } from "../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";
import type { EditProposalApplyResult } from "./editProposalApply.js";
import type { EditProposalReview } from "./editProposalReview.js";
import type { EditProposalSelection } from "./editProposalSelection.js";
import type { FencedEditReplacementRoute } from "./fencedEditRoute.js";
import type { ProposalHunkSetRoute } from "./proposalHunkSetRoute.js";
import type { TargetSetEditRoute } from "./targetSetEditRoute.js";

export function buildEditProposalReviewResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly review: EditProposalReview;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
}): OrchestrationResult {
  const codingResult = buildCodingResult(input);
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({ ...input, codingResult }),
    buildTerminalInput(input.applyResult),
  );
}

function buildCodingResult(input: {
  readonly review: EditProposalReview;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
}): CodingResultSummary {
  const state = input.applyResult?.status ?? input.selection?.state ?? input.review.reviewStatus;
  const success = input.applyResult
    ? input.applyResult.status === "single-target-applied" ||
      input.applyResult.status === "target-set-applied" ||
      input.applyResult.status === "hunk-set-applied"
    : false;
  const partial =
    input.applyResult?.status === "target-set-partial-failure" ||
    input.applyResult?.status === "hunk-set-partial-failure";
  const changedFiles = [...(input.applyResult?.changedFiles ?? [])];
  const failedFiles = failedFilesFor(input);
  const reason = reasonFor(input);
  const nextAction = nextActionFor(input);
  const evidence = [
    ...input.review.evidence,
    ...(input.selection?.evidence ?? []),
    ...(input.applyResult?.evidence ?? []),
    `edit-proposal-result:state:${state}`,
    success
      ? "edit-proposal-result:confirmed-applied"
      : partial
        ? "edit-proposal-result:partial-applied"
        : "edit-proposal-result:no-write-or-stopped",
    "edit-proposal-result:raw-content-excluded",
  ];
  return {
    taskKind: "edit-file",
    changedFiles,
    failedFiles,
    patches: success
      ? changedFiles.map((file) => ({
          path: file,
          operation: "replace" as const,
          status: "applied" as const,
        }))
      : [
          {
            path: input.review.targetLabels.join(", ") || "(edit proposal)",
            operation: "replace",
            status: "failed",
            failureCode: patchFailureCode(input.applyResult?.status),
            reason,
          },
        ],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [
        "proposal review/apply bridge used existing edit lanes; no proposal writer was introduced.",
      ],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [
        input.review.transcriptSummary,
        ...(input.selection ? [input.selection.transcriptSummary] : []),
        ...(input.applyResult ? [input.applyResult.transcriptSummary] : []),
        ...evidence,
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [...changedFiles],
      attemptedFiles: input.applyResult ? [...changedFiles] : [],
      changedFiles: [...changedFiles],
      unchangedAttemptedFiles: success ? [] : [...input.review.targetLabels],
    },
    taskSatisfaction: {
      verdict: success ? "satisfied" : partial ? "completed-with-caveats" : "insufficient-evidence",
      reasons: [reason],
      requiredEvidence: [
        "proposal review",
        "explicit selection",
        "explicit confirmation",
        "existing fenced or target-set route",
        "proposal hunk-set route when per-target mappings differ",
        "workspace authority",
        "final stale-read",
        "snapshot/recovery",
        "verification",
      ],
      observedEvidence: [...evidence],
    },
    verifiedFiles: success ? [...changedFiles] : [],
    unverifiedFiles: success ? [] : failedFiles.length ? failedFiles : [{ path: "(edit proposal)", reason }],
    verification: success
      ? {
          status: "passed",
          reason: "Existing proposal apply route completed and verified.",
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
        }
      : {
          status: partial ? "failed" : "blocked",
          reason,
          blockerKind: "unknown",
          nextAction,
        },
    evidence,
    lastActionResultSeed: {
      actionKind: "edit-file",
      changedFiles: [...changedFiles],
      verifiedFiles: success ? [...changedFiles] : [],
      verification: success
        ? {
            status: "passed",
            reason: "Existing proposal apply route completed and verified.",
          }
        : {
            status: partial ? "failed" : "blocked",
            reason,
            blockerKind: "unknown",
          },
      ...(success ? {} : { reason, blockerKind: "unknown" as const }),
    },
    ...(success ? {} : { failureBoundary: `edit-proposal-${state}` }),
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly review: EditProposalReview;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
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
        `edit proposal review=${input.review.proposalId}`,
        `edit proposal state=${input.applyResult?.status ?? input.selection?.state ?? input.review.reviewStatus}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: buildOutput(input),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildTerminalInput(
  applyResult: EditProposalApplyResult | undefined,
): QueryTerminal {
  if (
    applyResult?.status === "single-target-applied" ||
    applyResult?.status === "target-set-applied" ||
    applyResult?.status === "hunk-set-applied"
  ) {
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
    stopReason:
      applyResult && "nextAction" in applyResult
        ? applyResult.nextAction
        : "Review, select, and explicitly confirm exact proposal hunks before apply.",
  };
}

function buildOutput(input: {
  readonly review: EditProposalReview;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
}): string {
  return [
    "edit proposal review/apply evaluated.",
    `Proposal: ${input.review.proposalId}`,
    `Review: ${input.review.reviewStatus}`,
    `Selection: ${input.selection?.state ?? "none"}`,
    `Apply: ${input.applyResult?.status ?? "not-run"}`,
    `Changed: ${input.applyResult?.changedFiles.join(", ") || "none"}`,
    "Raw content: excluded",
  ].join("\n");
}

function failedFilesFor(input: {
  readonly review: EditProposalReview;
  readonly applyResult?: EditProposalApplyResult;
}): Array<{ path: string; reason: string }> {
  if (!input.applyResult || !("route" in input.applyResult)) {
    return [{ path: input.review.targetLabels.join(", ") || "(edit proposal)", reason: reasonFor(input) }];
  }
  const route = input.applyResult.route;
  if (route.source === "target-set-edit-route") {
    return route.failedFiles.map((failure) => ({ ...failure }));
  }
  if (route.source === "proposal-hunk-set-route") {
    return route.failedFiles.map((failure) => ({
      path: failure.path,
      reason: failure.reason,
    }));
  }
  return route.status === "blocked"
    ? [{ path: route.targetPath ?? "(edit proposal)", reason: route.nextAction }]
    : [];
}

function reasonFor(input: {
  readonly review: EditProposalReview;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
}): string {
  if (input.applyResult) {
    if ("reason" in input.applyResult) {
      return input.applyResult.reason;
    }
    return input.applyResult.status === "single-target-applied" ||
      input.applyResult.status === "target-set-applied" ||
      input.applyResult.status === "hunk-set-applied"
      ? "Confirmed proposal applied through an existing exact edit lane."
      : routeNextAction(input.applyResult.route);
  }
  return input.selection?.reason ?? "Proposal review was created; mutation did not run.";
}

function nextActionFor(input: {
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
}): string {
  if (input.applyResult && "nextAction" in input.applyResult) {
    return input.applyResult.nextAction;
  }
  if (input.applyResult && "route" in input.applyResult) {
    return routeNextAction(input.applyResult.route);
  }
  return input.selection?.nextAction ?? "Review, select, and explicitly confirm exact hunks before apply.";
}

function routeNextAction(
  route: FencedEditReplacementRoute | TargetSetEditRoute | ProposalHunkSetRoute,
): string {
  if (
    route.source === "target-set-edit-route" ||
    route.source === "proposal-hunk-set-route"
  ) {
    return route.nextAction;
  }
  return route.status === "blocked"
    ? route.nextAction
    : "Existing fenced edit route completed.";
}

function patchFailureCode(
  status: EditProposalApplyResult["status"] | undefined,
): CodingPatchFailureCode {
  switch (status) {
    case "invalid-selection":
    case "unsupported-for-apply":
      return "patch-generation-failed";
    default:
      return "patch-ambiguous";
  }
}
