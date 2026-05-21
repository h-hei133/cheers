import { mapTerminalToOrchestrationResult } from "../core/query/resultMapper.js";
import type { QueryRuntimeState } from "../core/query/runtimeState.js";
import type { QueryTerminal } from "../core/query/transitions.js";
import { createEmptyLifecycleIndex } from "../core/tools/toolResultLifecycle.js";
import type {
  CodingPatchFailureCode,
  CodingResultSummary,
  OrchestrationResult,
} from "./types.js";
import type { ContextAwareProviderProposalPlan } from "./contextAwareProviderProposal.js";

export function buildContextAwareProviderProposalResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly plan: ContextAwareProviderProposalPlan;
}): OrchestrationResult {
  const codingResult = buildCodingResult(input.plan);
  return mapTerminalToOrchestrationResult(
    buildRuntimeState({
      sessionId: input.sessionId,
      prompt: input.prompt,
      plan: input.plan,
      codingResult,
    }),
    buildTerminalInput(input.plan),
  );
}

function buildCodingResult(
  plan: ContextAwareProviderProposalPlan,
): CodingResultSummary {
  const target =
    "manifest" in plan
      ? plan.manifest.targets.map((entry) => entry.pathLabel).join(", ")
      : plan.input.targetLabels.join(", ") || "(context-aware provider proposal)";
  const manifest = "manifest" in plan ? plan.manifest : undefined;
  const contextSummary = [
    `context-aware-provider proposal=${manifest?.proposalId ?? "(none)"}`,
    `status=${plan.status}`,
    ...(plan.input.contextPacketId
      ? [`contextPacket=${plan.input.contextPacketId}`]
      : []),
    ...(plan.input.agentPlanId ? [`agentPlan=${plan.input.agentPlanId}`] : []),
    `contextCompleteness=${plan.input.contextCompleteness}`,
    `planConfidence=${plan.input.planConfidence}`,
    `missingFacts=${plan.input.missingFacts.length}`,
    `suggestedReads=${plan.input.suggestedReads.length}`,
    `reviewRequired=${manifest?.reviewRequired ?? false}`,
    `handoffReadiness=${manifest?.handoffReadiness ?? "none"}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");
  const evidence = [
    ...(manifest ? manifest.evidence : []),
    ...plan.evidence,
    contextSummary,
    `context-aware-provider-result:state:${plan.status}`,
    "context-aware-provider-result:mutation-authority:not-granted",
    "context-aware-provider-result:mutation:not-run",
    "context-aware-provider-result:raw-content-excluded",
    "actionable-blocker-kind:unsupported-future-edit",
  ];

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
      notes: [
        "context-aware provider proposal is no-write; existing edit lanes own mutation.",
      ],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence,
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
      reasons: [plan.reason],
      requiredEvidence: [
        "complete targeted context packet",
        "Agent Plan readiness",
        "provider proposal review",
        "explicit target confirmation",
        "existing write route authority and stale-read checks",
      ],
      observedEvidence: evidence,
    },
    verifiedFiles: [],
    unverifiedFiles: [{ path: target, reason: plan.reason }],
    verification: {
      status: "blocked",
      reason: plan.reason,
      blockerKind: "unknown",
      nextAction: plan.nextAction,
    },
    evidence,
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
    failureBoundary: `context-aware-provider-${plan.status}`,
  };
}

function buildRuntimeState(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly plan: ContextAwareProviderProposalPlan;
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
        "context-aware provider proposal consumed context packet and Agent Plan evidence.",
        `context-aware provider status=${input.plan.status}`,
      ],
      handoffs: [],
    },
    transcript: [
      {
        role: "coder",
        content: buildOutput(input.plan),
        codingResult: input.codingResult,
      },
    ],
    visitedTransitions: new Set<string>(),
  };
}

function buildTerminalInput(plan: ContextAwareProviderProposalPlan): QueryTerminal {
  return {
    action: "terminal",
    terminalReason: "stopped_error",
    terminalClassification: "stopped",
    stopReason: plan.nextAction,
  };
}

function buildOutput(plan: ContextAwareProviderProposalPlan): string {
  const manifest = "manifest" in plan ? plan.manifest : undefined;
  return [
    "context-aware provider proposal evaluated; mutation did not run.",
    `Proposal: ${manifest?.proposalId ?? "(none)"}`,
    `Status: ${plan.status}`,
    `Context packet: ${plan.input.contextPacketId ?? "(none)"}`,
    `Agent Plan: ${plan.input.agentPlanId ?? "(none)"}`,
    `Readiness: ${manifest?.handoffReadiness ?? "none"}`,
    `Next: ${plan.nextAction}`,
    "Provider proposal direct mutation: no",
    "Raw content: excluded",
  ].join("\n");
}

function patchFailureCode(
  status: ContextAwareProviderProposalPlan["status"],
): CodingPatchFailureCode {
  switch (status) {
    case "context-missing-stopped":
    case "context-over-budget-stopped":
    case "provider-invalid-proposal":
      return "patch-generation-failed";
    default:
      return "patch-ambiguous";
  }
}
