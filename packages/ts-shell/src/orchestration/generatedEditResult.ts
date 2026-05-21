import { mapTerminalToOrchestrationResult } from "../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../core/query/runtimeState.js";
import type { QueryTerminal } from "../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";
import type { GeneratedEditHandoffResult } from "./generatedEditConfirmation.js";
import type { GeneratedEditPlan } from "./generatedEditPlanner.js";

export function buildGeneratedEditProposalResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly plan: GeneratedEditPlan;
  readonly handoff?: GeneratedEditHandoffResult;
}): OrchestrationResult {
  const codingResult = input.handoff
    ? buildHandoffCodingResult(input.plan, input.handoff)
    : buildNoWriteCodingResult(input.plan);
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({
      sessionId: input.sessionId,
      prompt: input.prompt,
      plan: input.plan,
      handoff: input.handoff,
      codingResult,
    }),
    buildTerminalInput(input.plan, input.handoff),
  );
}

function buildNoWriteCodingResult(plan: GeneratedEditPlan): CodingResultSummary {
  const target = plan.manifest.targetLabels.join(", ") || "(generated edit proposal)";
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [{ path: target, reason: plan.reason }],
    patches: [
      {
        path: target,
        operation: "replace",
        status: "failed",
        failureCode: patchFailureCode(plan.status),
        reason: plan.reason,
      },
    ],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: ["generated edit proposal is no-write; no repair was attempted."],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [
        plan.manifest.transcriptSummary,
        ...plan.evidence,
        "generated-edit-result:proposal-state",
        "generated-edit-result:mutation:not-run",
        "generated-edit-result:raw-content-excluded",
        "actionable-blocker-kind:unsupported-future-edit",
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [...plan.manifest.targetLabels],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [plan.reason],
      requiredEvidence: [
        "reviewed proposal",
        "explicit old/new mapping",
        "explicit target confirmation",
        "workspace authority in existing write route",
        "final stale-read in existing write route",
        "snapshot/recovery in existing write route",
        "post-write verification in existing write route",
      ],
      observedEvidence: [...plan.evidence],
    },
    verifiedFiles: [],
    unverifiedFiles: [{ path: target, reason: plan.reason }],
    verification: {
      status: "blocked",
      reason: plan.reason,
      blockerKind: "unknown",
      nextAction: plan.nextAction,
    },
    evidence: [
      ...plan.evidence,
      `generated-edit-result:state:${plan.status}`,
      "generated-edit-result:mutation-authority:not-granted",
      "generated-edit-result:mutation:not-run",
      "generated-edit-result:raw-content-excluded",
      "actionable-blocker-kind:unsupported-future-edit",
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      changedFiles: [],
      verifiedFiles: [],
      verification: {
        status: "blocked",
        reason: plan.reason,
        blockerKind: "unknown",
      },
      reason: plan.reason,
      blockerKind: "unknown",
    },
    failureBoundary: `generated-edit-${plan.status}`,
  };
}

function buildHandoffCodingResult(
  plan: GeneratedEditPlan,
  handoff: GeneratedEditHandoffResult,
): CodingResultSummary {
  const success =
    handoff.status === "single-target-handoff"
      ? handoff.route.status === "written"
      : handoff.status === "target-set-handoff"
        ? handoff.route.status === "written"
        : false;
  const handoffFailureReason = generatedHandoffFailureReason(handoff);
  const failedFiles = generatedHandoffFailedFiles(handoff);
  const reason = success
    ? "Generated edit proposal handed off through an existing exact edit lane and passed that lane's checks."
    : handoffFailureReason;
  return {
    taskKind: "edit-file",
    changedFiles: success ? [...handoff.changedFiles] : [],
    failedFiles: success
      ? []
      : failedFiles.length > 0
        ? failedFiles
        : [{ path: "(generated edit handoff)", reason }],
    patches: success
      ? handoff.changedFiles.map((file) => ({
          path: file,
          operation: "replace" as const,
          status: "applied" as const,
        }))
      : [
          {
            path: "(generated edit handoff)",
            operation: "replace",
            status: "failed",
            failureCode: "patch-generation-failed",
            reason,
          },
        ],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [
        "generated proposal did not write directly; existing edit route owned mutation and recovery.",
      ],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [
        plan.manifest.transcriptSummary,
        `generated-edit handoff=${handoff.status}; proposal=${handoff.proposalId}; changed=${handoff.changedFiles.join(", ") || "none"}; raw-content-excluded`,
        ...handoff.evidence,
        "generated-edit-result:handoff-state",
        "generated-edit-result:raw-content-excluded",
      ],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: success ? [...handoff.changedFiles] : [],
      attemptedFiles: handoff.status === "stopped-no-write" ? [] : [...handoff.changedFiles],
      changedFiles: success ? [...handoff.changedFiles] : [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: success ? "satisfied" : "completed-with-caveats",
      reasons: [reason],
      requiredEvidence: [
        "explicit confirmed generated proposal",
        "exact old/new mapping",
        "existing fenced or target-set lane handoff",
        "workspace authority",
        "final stale-read",
        "snapshot/recovery",
        "verification",
      ],
      observedEvidence: [...handoff.evidence],
    },
    verifiedFiles: success ? [...handoff.changedFiles] : [],
    unverifiedFiles: success ? [] : [{ path: "(generated edit handoff)", reason }],
    verification: success
      ? {
          status: "passed",
          reason:
            "Existing exact edit lane reported successful post-write verification.",
          selectionScope: "focused",
          selectionSource: "auto-from-changes",
        }
      : {
          status: "blocked",
          reason,
          blockerKind: "unknown",
          nextAction:
            handoff.status === "stopped-no-write" ? handoff.nextAction : reason,
        },
    evidence: [
      ...handoff.evidence,
      `generated-edit-result:handoff:${handoff.status}`,
      success
        ? "generated-edit-result:coding-result-success"
        : "generated-edit-result:coding-result-blocked",
      "generated-edit-result:raw-content-excluded",
    ],
    lastActionResultSeed: {
      actionKind: "edit-file",
      changedFiles: success ? [...handoff.changedFiles] : [],
      verifiedFiles: success ? [...handoff.changedFiles] : [],
      verification: success
        ? {
            status: "passed",
            reason:
              "Existing exact edit lane reported successful post-write verification.",
          }
        : {
            status: "blocked",
            reason,
            blockerKind: "unknown",
          },
      ...(success ? {} : { reason, blockerKind: "unknown" as const }),
    },
    ...(success ? {} : { failureBoundary: `generated-edit-${handoff.status}` }),
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly plan: GeneratedEditPlan;
  readonly handoff?: GeneratedEditHandoffResult;
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
        "generated edit result consumed Edit/Patch owned proposal output.",
        `generated edit proposal=${input.plan.manifest.proposalId}`,
        `generated edit status=${input.handoff?.status ?? input.plan.status}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: buildOutput(input.plan, input.handoff),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function generatedHandoffFailureReason(
  handoff: GeneratedEditHandoffResult,
): string {
  if (handoff.status === "stopped-no-write") {
    return handoff.reason;
  }
  if (handoff.status === "target-set-handoff") {
    return handoff.route.nextAction;
  }
  return handoff.route.status === "blocked"
    ? handoff.route.nextAction
    : "Generated edit handoff did not complete.";
}

function generatedHandoffFailedFiles(
  handoff: GeneratedEditHandoffResult,
): Array<{ path: string; reason: string }> {
  if (handoff.status === "stopped-no-write") {
    return [];
  }
  if (handoff.status === "target-set-handoff") {
    return handoff.route.failedFiles.map((failure) => ({ ...failure }));
  }
  if (handoff.route.status === "blocked") {
    return [
      {
        path: handoff.route.targetPath ?? "(generated edit handoff)",
        reason: handoff.route.nextAction,
      },
    ];
  }
  return [];
}

function buildTerminalInput(
  plan: GeneratedEditPlan,
  handoff: GeneratedEditHandoffResult | undefined,
): QueryTerminal {
  if (
    handoff &&
    ((handoff.status === "single-target-handoff" &&
      handoff.route.status === "written") ||
      (handoff.status === "target-set-handoff" &&
        handoff.route.status === "written"))
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
    stopReason: handoff?.status === "stopped-no-write" ? handoff.nextAction : plan.nextAction,
  };
}

function buildOutput(
  plan: GeneratedEditPlan,
  handoff: GeneratedEditHandoffResult | undefined,
): string {
  if (handoff) {
    return [
      "generated edit proposal handoff evaluated.",
      `Proposal: ${handoff.proposalId}`,
      `Handoff: ${handoff.status}`,
      `Changed: ${handoff.changedFiles.join(", ") || "none"}`,
      "Generated proposal direct mutation: no",
      "Raw content: excluded",
    ].join("\n");
  }
  return [
    "generated edit proposal created; mutation did not run.",
    `Proposal: ${plan.manifest.proposalId}`,
    `Status: ${plan.status}`,
    `Readiness: ${plan.manifest.mutationReadiness}`,
    `Confirmation: ${plan.manifest.confirmationStatus}`,
    `Summary: ${plan.manifest.safeSummary}`,
    `Next: ${plan.nextAction}`,
  ].join("\n");
}

function patchFailureCode(status: GeneratedEditPlan["status"]): CodingPatchFailureCode {
  switch (status) {
    case "missing-generated-content":
    case "proposal-created-no-write":
    case "confirmation-required":
      return "patch-generation-failed";
    case "broad-generated-request":
    case "fuzzy-generated-request":
    case "generated-discovery-request":
    case "unsupported-provider-generated-request":
      return "patch-ambiguous";
    default:
      return "patch-generation-failed";
  }
}
