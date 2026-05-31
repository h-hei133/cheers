import { mapTerminalToOrchestrationResult } from "../core/query/mapping/mapper.js";
import type { QueryRuntimeState } from "../core/query/runtime/state.js";
import type { QueryTerminal } from "../core/query/runtime/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  CodingVerificationSummary,
  OrchestrationResult,
} from "./types.js";
import type { EditProposalApplyResult } from "./editProposalApply.js";
import type { EditProposalReview } from "./editProposalReview.js";
import type { EditProposalSelection } from "./editProposalSelection.js";
import type { EditRepairContext } from "./editRepairContext.js";
import type { EditRepairPlan } from "./editRepairPlanner.js";

export interface RepairPostApplyVerification extends CodingVerificationSummary {
  readonly runtimeDerived: true;
  readonly evidence: readonly string[];
}

export type EditRepairResultState =
  | "repair-context-created"
  | "repair-proposal-created"
  | "repair-review-required"
  | "repair-proposal-invalid"
  | "repair-ready-for-hunk-set-handoff"
  | "repair-applied"
  | "repair-apply-stopped"
  | "repair-apply-partial-failure"
  | "repair-not-needed"
  | "repair-unsupported";

export function buildEditRepairResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly context: EditRepairContext;
  readonly plan?: EditRepairPlan;
  readonly review?: EditProposalReview;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
  readonly postApplyVerification?: RepairPostApplyVerification;
}): OrchestrationResult {
  const codingResult = buildCodingResult(input);
  const state = projectRepairResultState(input);
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({ ...input, codingResult }),
    buildTerminalInput({ state, verified: isRepairVerified(input) }),
  );
}

function buildCodingResult(input: {
  readonly context: EditRepairContext;
  readonly plan?: EditRepairPlan;
  readonly review?: EditProposalReview;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
  readonly postApplyVerification?: RepairPostApplyVerification;
}): CodingResultSummary {
  const state = projectRepairResultState(input);
  const success = isRepairVerified(input);
  const partial = state === "repair-apply-partial-failure";
  const changedFiles = [...(input.applyResult?.changedFiles ?? [])];
  const reason = reasonFor(input);
  const nextAction = nextActionFor(input);
  const failedFiles = failedFilesFor(input, reason);
  const evidence = [
    ...input.context.evidence,
    ...(input.plan?.evidence ?? []),
    ...(input.review?.evidence ?? []),
    ...(input.selection?.evidence ?? []),
    ...(input.applyResult?.evidence ?? []),
    ...(input.postApplyVerification
      ? [
          ...input.postApplyVerification.evidence,
          `edit-repair-result:post-apply-verification:${input.postApplyVerification.status}`,
          "edit-repair-result:post-apply-verification:runtime-derived",
        ]
      : []),
    `edit-repair-result:state:${state}`,
    success
      ? "edit-repair-result:repair-verified-through-hunk-set"
      : partial
        ? "edit-repair-result:repair-apply-partial-failure"
        : state === "repair-applied"
          ? "edit-repair-result:repair-apply-without-reverification"
        : "edit-repair-result:no-automatic-repair",
    ...(success ? ["edit-repair-result:repair-applied-through-hunk-set"] : []),
    "edit-repair-result:provider-call-during-apply:not-run",
    "edit-repair-result:mutation-authority:not-granted-until-existing-route",
    "edit-repair-result:raw-content-excluded",
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
            path: input.context.failedFileLabels.join(", ") || "(edit repair)",
            operation: "replace",
            status: "failed",
            failureCode: patchFailureCode(state),
            reason,
          },
        ],
    repair: {
      status: success ? "recovered" : "failed",
      attempts: input.applyResult ? 1 : 0,
      recoveredItems: success ? changedFiles : [],
      failedItems: failedFiles.map((file) => file.path),
      notes: [
        "verification repair proposal is review-gated; no automatic repair mutation was attempted.",
        "repair apply, when present, reused the existing proposal hunk-set apply route.",
        `Next action: ${nextAction}`,
      ],
    },
    continuation: {
      status: success ? "recovered-after-continuation" : "failed-after-bounded-continuation",
      attempts: input.applyResult ? 1 : 0,
      evidence: [
        input.context.transcriptSummary,
        ...(input.plan && "manifest" in input.plan && input.plan.manifest
          ? [input.plan.manifest.transcriptSummary]
          : []),
        ...(input.review ? [input.review.transcriptSummary] : []),
        ...(input.selection ? [input.selection.transcriptSummary] : []),
        ...(input.applyResult ? [input.applyResult.transcriptSummary] : []),
        ...evidence,
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: changedFiles,
      attemptedFiles: input.applyResult ? changedFiles : [],
      changedFiles,
      unchangedAttemptedFiles: success ? [] : [...input.context.failedFileLabels],
    },
    taskSatisfaction: {
      verdict: success ? "satisfied" : partial ? "completed-with-caveats" : "insufficient-evidence",
      reasons: [reason],
      requiredEvidence: [
        "failed verification context",
        "safe redacted repair context",
        "repair proposal manifest",
        "proposal review",
        "explicit selection and confirmation",
        "existing hunk-set apply handoff",
        "workspace authority",
        "final stale-read",
        "snapshot/recovery",
        "independent post-repair verification",
      ],
      observedEvidence: evidence,
    },
    verifiedFiles: success ? changedFiles : [],
    unverifiedFiles: success ? [] : failedFiles,
    verification: success
      ? {
          status: "passed",
          reason: input.postApplyVerification?.reason ?? "Confirmed repair proposal applied through the existing hunk-set route and verified.",
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
        }
      : {
          status: state === "repair-not-needed" ? "blocked" : input.context.failedVerificationSummary.status === "failed" ? "failed" : "blocked",
          reason,
          blockerKind: "unknown",
          nextAction,
        },
    evidence,
    lastActionResultSeed: {
      actionKind: "edit-file",
      changedFiles,
      verifiedFiles: success ? changedFiles : [],
      writerStarted: changedFiles.length > 0,
      writeEffect: success ? "verified" : changedFiles.length > 0 ? "unverified" : "none",
      requiresUserInspection: !success,
      verification: success
        ? {
            status: "passed",
            reason: input.postApplyVerification?.reason ?? "Confirmed repair proposal applied and verified.",
          }
        : {
            status:
              state === "repair-applied"
                ? input.postApplyVerification?.status ?? "blocked"
                : input.context.failedVerificationSummary.status === "failed" ? "failed" : "blocked",
            reason,
            blockerKind: "unknown",
          },
      ...(success ? {} : { reason, blockerKind: "unknown" as const }),
    },
    ...(success ? {} : { failureBoundary: `edit-repair-${state}` }),
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly context: EditRepairContext;
  readonly plan?: EditRepairPlan;
  readonly review?: EditProposalReview;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
  readonly postApplyVerification?: RepairPostApplyVerification;
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
        `edit repair context=${input.context.repairContextId}`,
        `edit repair state=${projectRepairResultState(input)}`,
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

function buildTerminalInput(input: {
  readonly state: EditRepairResultState;
  readonly verified: boolean;
}): QueryTerminal {
  if (input.verified) {
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
      input.state === "repair-applied"
        ? "Run and pass post-repair verification before claiming repair success."
        : input.state === "repair-ready-for-hunk-set-handoff"
        ? "Confirm handoff to the existing hunk-set apply route before mutation."
        : "Review the repair proposal and explicitly confirm exact hunks before apply.",
  };
}

function buildOutput(input: {
  readonly context: EditRepairContext;
  readonly plan?: EditRepairPlan;
  readonly review?: EditProposalReview;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
  readonly postApplyVerification?: RepairPostApplyVerification;
}): string {
  return [
    "verification repair proposal evaluated.",
    `Context: ${input.context.repairContextId}`,
    `Original verification: ${input.context.failedVerificationSummary.status}`,
    `Repair state: ${projectRepairResultState(input)}`,
    `Proposal: ${input.plan && "manifest" in input.plan && input.plan.manifest ? input.plan.manifest.repairProposalId : "none"}`,
    `Review: ${input.review?.reviewStatus ?? "not-run"}`,
    `Selection: ${input.selection?.state ?? "none"}`,
    `Apply: ${input.applyResult?.status ?? "not-run"}`,
    `Post-repair verification: ${input.postApplyVerification?.status ?? "not-run"}`,
    `Changed: ${input.applyResult?.changedFiles.join(", ") || "none"}`,
    "Raw content: excluded",
  ].join("\n");
}

function projectRepairResultState(input: {
  readonly context: EditRepairContext;
  readonly plan?: EditRepairPlan;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
}): EditRepairResultState {
  if (input.applyResult) {
    switch (input.applyResult.status) {
      case "hunk-set-applied":
      case "single-target-applied":
      case "target-set-applied":
        return "repair-applied";
      case "hunk-set-partial-failure":
      case "target-set-partial-failure":
        return "repair-apply-partial-failure";
      default:
        return "repair-apply-stopped";
    }
  }
  if (input.plan?.status === "repair-ready-for-hunk-set-handoff") {
    return "repair-ready-for-hunk-set-handoff";
  }
  if (
    input.selection?.source === "repair" &&
    (input.selection.state === "confirmed-exact-target-set" ||
      input.selection.state === "confirmed-exact-single-target")
  ) {
    return "repair-ready-for-hunk-set-handoff";
  }
  switch (input.plan?.status ?? input.context.status) {
    case "repair-proposal-created":
      return "repair-proposal-created";
    case "repair-review-required":
      return "repair-review-required";
    case "repair-proposal-invalid":
      return "repair-proposal-invalid";
    case "repair-not-needed":
      return "repair-not-needed";
    case "repair-context-created":
      return "repair-context-created";
    default:
      return "repair-unsupported";
  }
}

function reasonFor(input: {
  readonly context: EditRepairContext;
  readonly plan?: EditRepairPlan;
  readonly applyResult?: EditProposalApplyResult;
  readonly postApplyVerification?: RepairPostApplyVerification;
}): string {
  if (input.applyResult) {
    if (
      input.applyResult.status === "hunk-set-applied" ||
      input.applyResult.status === "single-target-applied" ||
      input.applyResult.status === "target-set-applied"
    ) {
      if (input.postApplyVerification?.status === "passed") {
        return "Confirmed repair proposal applied through an existing exact edit lane and re-verified.";
      }
      if (input.postApplyVerification?.status === "failed") {
        return input.postApplyVerification.reason ?? "Repair apply succeeded, but post-repair verification failed.";
      }
      return "Repair apply succeeded, but post-repair verification has not run.";
    }
    if ("reason" in input.applyResult) {
      return input.applyResult.reason;
    }
    return "Repair apply stopped in the existing exact edit lane.";
  }
  return (
    input.plan?.reason ??
    input.context.failedVerificationSummary.reason ??
    "Verification failed; repair proposal review is required before any mutation."
  );
}

function isRepairVerified(input: {
  readonly applyResult?: EditProposalApplyResult;
  readonly postApplyVerification?: RepairPostApplyVerification;
}): boolean {
  if (!input.applyResult) return false;
  return (
    (
      input.applyResult.status === "hunk-set-applied" ||
      input.applyResult.status === "single-target-applied" ||
      input.applyResult.status === "target-set-applied"
    ) &&
    input.postApplyVerification?.status === "passed" &&
    input.postApplyVerification.runtimeDerived === true &&
    input.postApplyVerification.evidence.length > 0
  );
}

function nextActionFor(input: {
  readonly context: EditRepairContext;
  readonly plan?: EditRepairPlan;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
}): string {
  if (input.applyResult && "nextAction" in input.applyResult) {
    return input.applyResult.nextAction;
  }
  return (
    input.selection?.nextAction ??
    input.plan?.nextAction ??
    input.context.failedVerificationSummary.nextAction ??
    "Review the repair proposal, select exact hunks, and explicitly confirm before apply."
  );
}

function failedFilesFor(
  input: {
    readonly context: EditRepairContext;
    readonly applyResult?: EditProposalApplyResult;
  },
  reason: string,
): Array<{ path: string; reason: string }> {
  if (input.applyResult && "route" in input.applyResult && input.applyResult.route.source === "proposal-hunk-set-route") {
    return input.applyResult.route.failedFiles.map((file) => ({
      path: file.path,
      reason: file.reason,
    }));
  }
  return (input.context.failedFileLabels.length ? input.context.failedFileLabels : ["(edit repair)"]).map(
    (path) => ({ path, reason }),
  );
}

function patchFailureCode(state: EditRepairResultState): CodingPatchFailureCode {
  switch (state) {
    case "repair-proposal-invalid":
      return "patch-generation-failed";
    case "repair-apply-stopped":
    case "repair-apply-partial-failure":
      return "write-failed";
    default:
      return "patch-ambiguous";
  }
}
