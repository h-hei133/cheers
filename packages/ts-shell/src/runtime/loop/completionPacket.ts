import type { RepairVerdictProofInput } from "../../evidence/projection/repair/verdict.js";
import type {
  RepairApplyObservation,
  RepairApplyRequestObservation,
  RepairAuthorityObservation,
  RepairProposalObservation,
  RepairRequiredHandoff,
} from "../../repair/handoff/boundary.js";
import type { RepairVerdictTerminalProjection } from "../../result/projection/repair/verdict.js";
import type {
  PostRepairVerificationRequestObservation,
  PostRepairVerificationRequirementObservation,
  PostRepairVerificationResultObservation,
} from "../../verification/result/boundary.js";
import type {
  LoopFinalizationDecision,
  ProductLoopCloseoutProjection,
} from "./finalization.js";

export type ProductCompletionPacketStatus =
  | "complete"
  | "failed"
  | "blocked"
  | "awaiting_user"
  | "continue_next_turn"
  | "continue_verification"
  | "continue_repair"
  | "unsupported"
  | "not_proven";

export interface ProductCompletionPacket {
  readonly packetId: string;
  readonly resultProjectionId: string;
  readonly resultOwnedTerminalStatus: RepairVerdictTerminalProjection["status"];
  readonly resultOwnedTerminalClassification: RepairVerdictTerminalProjection["terminalClassification"];
  readonly loopDecisionId: string;
  readonly loopDecision: LoopFinalizationDecision["decision"];
  readonly closeoutId: string;
  readonly closeoutState: ProductLoopCloseoutProjection["status"];
  readonly status: ProductCompletionPacketStatus;
  readonly complete: boolean;
  readonly originalFailure: {
    readonly verificationFailureId: string;
    readonly failureClass: string;
    readonly status: string;
    readonly summary: string;
  };
  readonly repairRequiredFacts?: {
    readonly handoffId: string;
    readonly repairEligible: boolean;
    readonly repairBlocker: string;
    readonly authorityState: string;
    readonly repairRisk: string;
  };
  readonly proposalFacts?: {
    readonly proposalId: string;
    readonly readinessStatus: string;
    readonly authorityRequirement: string;
    readonly applyStatus: string;
    readonly postRepairVerificationStatus: string;
  };
  readonly authorityFacts?: {
    readonly authorityId: string;
    readonly authorityRequired: boolean;
    readonly authorityDecision: string;
    readonly authoritySource: string;
    readonly authorityMissingReason: string;
  };
  readonly applyRequestFacts?: {
    readonly requestId: string;
    readonly applyReadiness: string;
    readonly applyBlocker: string;
    readonly authorityState: string;
  };
  readonly applyObservationFacts?: {
    readonly repairApplyId: string;
    readonly repairApplyStatus: string;
    readonly applyAttempted: boolean;
    readonly authorityState: string;
    readonly applyReceiptIds: readonly string[];
    readonly touchedTargetSummaries: readonly string[];
  };
  readonly postRepairVerificationFacts?: {
    readonly requirementId?: string;
    readonly requestId?: string;
    readonly resultId?: string;
    readonly requirementStatus?: string;
    readonly dispatchStatus?: string;
    readonly resultStatus?: string;
    readonly taskRelevanceStatus?: string;
    readonly coverageStatus?: string;
    readonly receiptIds: readonly string[];
  };
  readonly evidenceFacts?: {
    readonly proofInputId: string;
    readonly proofStatus: RepairVerdictProofInput["proofStatus"];
    readonly verdictCandidateId: string;
  };
  readonly missingProofItems: readonly string[];
  readonly nextAction: string;
  readonly sessionCarryForwardFacts: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function buildProductCompletionPacket(input: {
  readonly resultProjection: RepairVerdictTerminalProjection;
  readonly loopDecision: LoopFinalizationDecision;
  readonly closeout: ProductLoopCloseoutProjection;
  readonly repairRequired?: RepairRequiredHandoff;
  readonly repairProposal?: RepairProposalObservation;
  readonly repairAuthority?: RepairAuthorityObservation;
  readonly repairApplyRequest?: RepairApplyRequestObservation;
  readonly repairApply?: RepairApplyObservation;
  readonly postRepairVerificationRequirement?: PostRepairVerificationRequirementObservation;
  readonly postRepairVerificationRequest?: PostRepairVerificationRequestObservation;
  readonly postRepairVerificationResult?: PostRepairVerificationResultObservation;
  readonly repairVerdictProofInput?: RepairVerdictProofInput;
  readonly notProvenClaims?: readonly string[];
}): ProductCompletionPacket {
  const missingProofItems = unique([
    ...input.resultProjection.missingProofItems,
    ...input.loopDecision.missingProofItems,
    ...input.closeout.missingProofItems,
    ...chainMissingProof(input),
  ]);
  const complete = input.resultProjection.status === "verified_with_repair" &&
    input.loopDecision.decision === "stop_complete" &&
    input.closeout.status === "complete" &&
    input.closeout.complete &&
    missingProofItems.length === 0;
  const status = complete ? "complete" : packetStatusFor(input);
  const originalFailureSummary =
    `id=${input.resultProjection.originalVerificationFailureId}; class=${input.resultProjection.originalFailureClass}; status=${input.resultProjection.originalFailureStatus}; summary=${input.repairRequired?.originalFailureSummary ?? input.repairProposal?.originalFailureSummary ?? input.repairApply?.originalFailureSummary ?? "not-recorded"}`;
  const notProvenClaims = unique([
    "product-completion-packet-is-not-terminal-truth",
    "product-consumer-is-not-terminal-truth",
    "session-carry-forward-is-not-terminal-truth",
    "event-emission-is-not-terminal-truth",
    "rendered-output-is-not-terminal-truth",
    "complete-packet-requires-result-owned-verified-status",
    "incomplete-proof-cannot-become-complete",
    "original-failure-must-remain-visible",
    ...input.resultProjection.notProvenClaims,
    ...input.loopDecision.notProvenClaims,
    ...input.closeout.notProvenClaims,
    ...(input.repairRequired?.notProvenClaims ?? []),
    ...(input.repairProposal?.notProvenClaims ?? []),
    ...(input.repairAuthority?.notProvenClaims ?? []),
    ...(input.repairApplyRequest?.notProvenClaims ?? []),
    ...(input.repairApply?.notProvenClaims ?? []),
    ...(input.postRepairVerificationRequirement?.notProvenClaims ?? []),
    ...(input.postRepairVerificationRequest?.notProvenClaims ?? []),
    ...(input.postRepairVerificationResult?.notProvenClaims ?? []),
    ...(input.repairVerdictProofInput?.notProvenClaims ?? []),
    ...(complete ? [] : ["product-completion-packet-is-not-complete"]),
    ...(input.notProvenClaims ?? []),
  ]);

  return deepFreeze({
    packetId: `${input.closeout.closeoutId}:completion-packet`,
    resultProjectionId: input.resultProjection.projectionId,
    resultOwnedTerminalStatus: input.resultProjection.status,
    resultOwnedTerminalClassification: input.resultProjection.terminalClassification,
    loopDecisionId: input.loopDecision.decisionId,
    loopDecision: input.loopDecision.decision,
    closeoutId: input.closeout.closeoutId,
    closeoutState: input.closeout.status,
    status,
    complete,
    originalFailure: {
      verificationFailureId: input.resultProjection.originalVerificationFailureId,
      failureClass: input.resultProjection.originalFailureClass,
      status: input.resultProjection.originalFailureStatus,
      summary: originalFailureSummary,
    },
    ...(input.repairRequired
      ? {
          repairRequiredFacts: {
            handoffId: input.repairRequired.handoffId,
            repairEligible: input.repairRequired.repairEligible,
            repairBlocker: input.repairRequired.repairBlocker,
            authorityState: input.repairRequired.authorityState,
            repairRisk: input.repairRequired.repairRisk,
          },
        }
      : {}),
    ...(input.repairProposal
      ? {
          proposalFacts: {
            proposalId: input.repairProposal.proposalId,
            readinessStatus: input.repairProposal.readinessStatus,
            authorityRequirement: input.repairProposal.authorityRequirement,
            applyStatus: input.repairProposal.applyStatus,
            postRepairVerificationStatus:
              input.repairProposal.postRepairVerificationStatus,
          },
        }
      : {}),
    ...(input.repairAuthority
      ? {
          authorityFacts: {
            authorityId: input.repairAuthority.authorityId,
            authorityRequired: input.repairAuthority.authorityRequired,
            authorityDecision: input.repairAuthority.authorityDecision,
            authoritySource: input.repairAuthority.authoritySource,
            authorityMissingReason: input.repairAuthority.authorityMissingReason,
          },
        }
      : {}),
    ...(input.repairApplyRequest
      ? {
          applyRequestFacts: {
            requestId: input.repairApplyRequest.requestId,
            applyReadiness: input.repairApplyRequest.applyReadiness,
            applyBlocker: input.repairApplyRequest.applyBlocker,
            authorityState: input.repairApplyRequest.authorityState,
          },
        }
      : {}),
    ...(input.repairApply
      ? {
          applyObservationFacts: {
            repairApplyId: input.repairApply.repairApplyId,
            repairApplyStatus: input.repairApply.repairApplyStatus,
            applyAttempted: input.repairApply.applyAttempted,
            authorityState: input.repairApply.authorityState,
            applyReceiptIds: [...input.repairApply.applyReceiptIds],
            touchedTargetSummaries: [...input.repairApply.touchedTargetSummaries],
          },
        }
      : {}),
    ...postRepairVerificationFacts(input),
    ...(input.repairVerdictProofInput?.verdictCandidateId
      ? {
          evidenceFacts: {
            proofInputId: input.repairVerdictProofInput.proofInputId,
            proofStatus: input.repairVerdictProofInput.proofStatus,
            verdictCandidateId: input.repairVerdictProofInput.verdictCandidateId,
          },
        }
      : {}),
    missingProofItems,
    nextAction: input.closeout.nextAction,
    sessionCarryForwardFacts: packetSessionCarryForwardFacts({
      status,
      resultStatus: input.resultProjection.status,
      loopDecision: input.loopDecision.decision,
      closeoutState: input.closeout.status,
      nextAction: input.closeout.nextAction,
      originalFailureSummary,
      repairChainSummary: input.closeout.repairChainSummary,
      verificationSummary: input.closeout.verificationSummary,
      pendingHandoff: input.closeout.pendingHandoff,
      missingProofItems,
      notProvenClaims,
    }),
    notProvenClaims,
    terminalSuccessClaim: false,
  });
}

function packetStatusFor(input: {
  readonly loopDecision: LoopFinalizationDecision;
  readonly closeout: ProductLoopCloseoutProjection;
  readonly resultProjection: RepairVerdictTerminalProjection;
}): ProductCompletionPacketStatus {
  if (input.closeout.status === "failed" || input.loopDecision.decision === "stop_failed") {
    return "failed";
  }
  if (input.closeout.status === "blocked" || input.loopDecision.decision === "stop_blocked") {
    return "blocked";
  }
  if (input.closeout.status === "awaiting_user" || input.loopDecision.decision === "await_user") {
    return "awaiting_user";
  }
  if (input.closeout.status === "continue_repair" || input.loopDecision.decision === "continue_repair") {
    return "continue_repair";
  }
  if (input.closeout.status === "continue_verification" || input.loopDecision.decision === "continue_verification") {
    return "continue_verification";
  }
  if (input.closeout.status === "continue_next_turn" || input.loopDecision.decision === "continue_next_turn") {
    return "continue_next_turn";
  }
  if (input.closeout.status === "unsupported" || input.loopDecision.decision === "unsupported") {
    return "unsupported";
  }
  if (input.resultProjection.status === "not_proven" || input.closeout.status === "not_proven") {
    return "not_proven";
  }
  return "not_proven";
}

function chainMissingProof(input: {
  readonly repairRequired?: RepairRequiredHandoff;
  readonly repairProposal?: RepairProposalObservation;
  readonly repairAuthority?: RepairAuthorityObservation;
  readonly repairApply?: RepairApplyObservation;
  readonly postRepairVerificationResult?: PostRepairVerificationResultObservation;
  readonly repairVerdictProofInput?: RepairVerdictProofInput;
}): readonly string[] {
  return [
    ...(input.repairRequired ? [] : ["repair-required"]),
    ...(input.repairProposal ? [] : ["repair-proposal"]),
    ...(input.repairAuthority?.authorityDecision === "granted" ? [] : ["repair-authority"]),
    ...(input.repairApply?.repairApplyStatus === "applied" ? [] : ["repair-apply"]),
    ...(input.postRepairVerificationResult?.status === "passed"
      ? []
      : ["post-repair-verification"]),
    ...(input.repairVerdictProofInput?.proofStatus === "complete"
      ? []
      : ["repair-verdict-proof"]),
  ];
}

function postRepairVerificationFacts(input: {
  readonly postRepairVerificationRequirement?: PostRepairVerificationRequirementObservation;
  readonly postRepairVerificationRequest?: PostRepairVerificationRequestObservation;
  readonly postRepairVerificationResult?: PostRepairVerificationResultObservation;
}): Pick<ProductCompletionPacket, "postRepairVerificationFacts"> {
  if (
    !input.postRepairVerificationRequirement &&
    !input.postRepairVerificationRequest &&
    !input.postRepairVerificationResult
  ) {
    return {};
  }
  return {
    postRepairVerificationFacts: {
      requirementId: input.postRepairVerificationRequirement?.requirementId,
      requestId: input.postRepairVerificationRequest?.requestId,
      resultId: input.postRepairVerificationResult?.resultId,
      requirementStatus:
        input.postRepairVerificationRequirement?.requirementStatus,
      dispatchStatus: input.postRepairVerificationRequest?.dispatchStatus,
      resultStatus: input.postRepairVerificationResult?.status,
      taskRelevanceStatus:
        input.postRepairVerificationResult?.taskRelevanceStatus ??
          input.postRepairVerificationRequest?.taskRelevanceStatus,
      coverageStatus:
        input.postRepairVerificationResult?.coverageStatus ??
          input.postRepairVerificationRequest?.coverageStatus,
      receiptIds: [
        ...(input.postRepairVerificationRequest?.receiptIds ?? []),
        ...(input.postRepairVerificationResult?.receiptIds ?? []),
      ],
    },
  };
}

function packetSessionCarryForwardFacts(input: {
  readonly status: ProductCompletionPacketStatus;
  readonly resultStatus: RepairVerdictTerminalProjection["status"];
  readonly loopDecision: LoopFinalizationDecision["decision"];
  readonly closeoutState: ProductLoopCloseoutProjection["status"];
  readonly nextAction: string;
  readonly originalFailureSummary: string;
  readonly repairChainSummary: string;
  readonly verificationSummary: string;
  readonly pendingHandoff: ProductLoopCloseoutProjection["pendingHandoff"];
  readonly missingProofItems: readonly string[];
  readonly notProvenClaims: readonly string[];
}): readonly string[] {
  return deepFreeze([
    `product-completion-packet-status:${input.status}`,
    `final-observed-result-status:${input.resultStatus}`,
    `loop-decision:${input.loopDecision}`,
    `closeout-state:${input.closeoutState}`,
    `next-action:${input.nextAction}`,
    `original-failure-summary:${input.originalFailureSummary}`,
    `repair-chain-summary:${input.repairChainSummary}`,
    `verification-summary:${input.verificationSummary}`,
    `pending-handoff:user=${input.pendingHandoff.userAction};verification=${input.pendingHandoff.verification};repair=${input.pendingHandoff.repair}`,
    `missing-proof-items:${input.missingProofItems.join(",") || "none"}`,
    `not-proven-claims:${input.notProvenClaims.join(",") || "none"}`,
    "product-completion-packet-terminal-success:false",
  ]);
}

function unique(values: readonly string[]): readonly string[] {
  return deepFreeze(Array.from(new Set(values)).sort());
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
