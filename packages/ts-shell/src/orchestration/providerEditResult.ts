import { mapTerminalToOrchestrationResult } from "../core/query/mapping/mapper.js";
import type { QueryRuntimeState } from "../core/query/runtime/state.js";
import type { QueryTerminal } from "../core/query/runtime/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";
import type { ProviderEditConfirmationDecision } from "./providerEditConfirmation.js";
import type { ProviderEditPlan } from "./providerEditPlanner.js";

export function buildProviderEditProposalResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly plan: ProviderEditPlan;
  readonly confirmation?: ProviderEditConfirmationDecision;
}): OrchestrationResult {
  const codingResult = buildCodingResult(input.plan, input.confirmation);
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({
      sessionId: input.sessionId,
      prompt: input.prompt,
      plan: input.plan,
      confirmation: input.confirmation,
      codingResult,
    }),
    buildTerminalInput(input.plan, input.confirmation),
  );
}

function buildCodingResult(
  plan: ProviderEditPlan,
  confirmation: ProviderEditConfirmationDecision | undefined,
): CodingResultSummary {
  const manifest = confirmation?.canHandoffToExactLane
    ? confirmation.manifest
    : plan.manifest;
  const target = manifest?.targets.map((entry) => entry.pathLabel).join(", ") ??
    "(provider edit proposal)";
  const reason = confirmation?.reason ?? plan.reason;
  const nextAction = confirmation?.nextAction ?? plan.nextAction;
  const evidence = [
    ...(manifest ? manifest.evidence : []),
    ...plan.evidence,
    ...(confirmation ? confirmation.evidence : []),
    `provider-edit-result:state:${confirmation?.state ?? plan.status}`,
    "provider-edit-result:mutation-authority:not-granted",
    "provider-edit-result:mutation:not-run",
    "provider-edit-result:raw-content-excluded",
    "actionable-blocker-kind:unsupported-future-edit",
  ];
  const continuationEvidence = [
    ...(manifest ? [manifest.transcriptSummary] : []),
    ...evidence,
  ];
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [{ path: target, reason }],
    patches: [
      {
        path: target,
        operation: "replace",
        status: "failed",
        failureCode: patchFailureCode(plan.status),
        reason,
      },
    ],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [
        "provider edit proposal is no-write; existing edit lanes own mutation.",
      ],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: continuationEvidence,
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: manifest?.targets.map((entry) => entry.pathLabel) ?? [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [reason],
      requiredEvidence: [
        "provider proposal review",
        "explicit old/new mapping",
        "explicit target confirmation",
        "workspace authority in existing write route",
        "final stale-read in existing write route",
        "snapshot/recovery in existing write route",
        "post-write verification in existing write route",
      ],
      observedEvidence: evidence,
    },
    verifiedFiles: [],
    unverifiedFiles: [{ path: target, reason }],
    verification: {
      status: "blocked",
      reason,
      blockerKind: "unknown",
      nextAction,
    },
    evidence,
    lastActionResultSeed: {
      actionKind: "edit-file",
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
    failureBoundary: `provider-edit-${confirmation?.state ?? plan.status}`,
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly plan: ProviderEditPlan;
  readonly confirmation?: ProviderEditConfirmationDecision;
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
        "provider edit result consumed no-write provider proposal output.",
        `provider edit status=${input.confirmation?.state ?? input.plan.status}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: buildOutput(input.plan, input.confirmation),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildTerminalInput(
  plan: ProviderEditPlan,
  confirmation: ProviderEditConfirmationDecision | undefined,
): QueryTerminal {
  return {
    action: "terminal",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason: confirmation?.nextAction ?? plan.nextAction,
  };
}

function buildOutput(
  plan: ProviderEditPlan,
  confirmation: ProviderEditConfirmationDecision | undefined,
): string {
  const manifest = confirmation?.canHandoffToExactLane
    ? confirmation.manifest
    : plan.manifest;
  return [
    "provider edit proposal evaluated; mutation did not run.",
    `Proposal: ${manifest?.proposalId ?? "(none)"}`,
    `Status: ${confirmation?.state ?? plan.status}`,
    `Readiness: ${manifest?.handoffReadiness ?? "none"}`,
    `Confirmation: ${manifest?.confirmationStatus ?? "none"}`,
    `Next: ${confirmation?.nextAction ?? plan.nextAction}`,
    "Provider proposal direct mutation: no",
    "Raw content: excluded",
  ].join("\n");
}

function patchFailureCode(status: ProviderEditPlan["status"]): CodingPatchFailureCode {
  switch (status) {
    case "provider-proposal-invalid":
    case "provider-context-missing":
    case "provider-context-over-budget":
      return "patch-generation-failed";
    default:
      return "patch-ambiguous";
  }
}
