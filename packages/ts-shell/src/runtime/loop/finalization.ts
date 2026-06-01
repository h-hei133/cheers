import type { RepairVerdictTerminalProjection } from "../../result/projection/repair/verdict.js";

export type LoopFinalizationDecisionStatus =
  | "stop_complete"
  | "stop_failed"
  | "stop_blocked"
  | "await_user"
  | "continue_next_turn"
  | "continue_repair"
  | "continue_verification"
  | "unsupported"
  | "not_proven";

export interface LoopFinalizationInput {
  readonly inputId: string;
  readonly resultProjectionId: string;
  readonly resultTerminalStatus: RepairVerdictTerminalProjection["status"];
  readonly resultTerminalClassification: RepairVerdictTerminalProjection["terminalClassification"];
  readonly proofComplete: boolean;
  readonly originalFailurePreserved: boolean;
  readonly repairApplyPreserved: boolean;
  readonly postRepairVerificationPreserved: boolean;
  readonly originalVerificationFailureId: string;
  readonly originalFailureClass: string;
  readonly repairApplyState: string;
  readonly postRepairVerificationState: string;
  readonly missingProofItems: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface LoopFinalizationDecision {
  readonly decisionId: string;
  readonly sourceInputId: string;
  readonly decision: LoopFinalizationDecisionStatus;
  readonly reason: string;
  readonly nextAction: string;
  readonly pendingUserAuthority: boolean;
  readonly pendingVerification: boolean;
  readonly pendingRepair: boolean;
  readonly sessionCarryForwardFacts: readonly string[];
  readonly originalVerificationFailureId: string;
  readonly originalFailureClass: string;
  readonly missingProofItems: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export type ProductLoopCloseoutStatus =
  | "complete"
  | "failed"
  | "blocked"
  | "awaiting_user"
  | "continue_next_turn"
  | "continue_verification"
  | "continue_repair"
  | "unsupported"
  | "not_proven";

export interface ProductLoopCloseoutInput {
  readonly inputId: string;
  readonly loopDecisionId: string;
  readonly resultProjectionId: string;
  readonly resultTerminalStatus: RepairVerdictTerminalProjection["status"];
  readonly resultTerminalClassification: RepairVerdictTerminalProjection["terminalClassification"];
  readonly loopControlDecision: LoopFinalizationDecisionStatus;
  readonly nextAction: string;
  readonly pendingUserAction: boolean;
  readonly pendingVerification: boolean;
  readonly pendingRepair: boolean;
  readonly preservedOriginalFailure: {
    readonly verificationFailureId: string;
    readonly failureClass: string;
    readonly status: string;
  };
  readonly preservedRepairFacts: {
    readonly proposalId: string;
    readonly authorityState: string;
    readonly applyState: string;
    readonly touchedTargetSummaries: readonly string[];
    readonly applyReceiptIds: readonly string[];
  };
  readonly verificationSummary: {
    readonly postRepairState: string;
    readonly relevanceStatus: string;
    readonly coverageStatus: string;
    readonly receiptIds: readonly string[];
  };
  readonly missingProofItems: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ProductLoopCloseoutProjection {
  readonly closeoutId: string;
  readonly sourceInputId: string;
  readonly status: ProductLoopCloseoutStatus;
  readonly resultOwnedTerminalStatus: RepairVerdictTerminalProjection["status"];
  readonly resultOwnedTerminalClassification: RepairVerdictTerminalProjection["terminalClassification"];
  readonly loopOwnedControlDecision: LoopFinalizationDecisionStatus;
  readonly complete: boolean;
  readonly nextAction: string;
  readonly pendingHandoff: {
    readonly userAction: boolean;
    readonly verification: boolean;
    readonly repair: boolean;
  };
  readonly sessionCarryForwardFacts: readonly string[];
  readonly originalFailureSummary: string;
  readonly repairChainSummary: string;
  readonly verificationSummary: string;
  readonly missingProofItems: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function createLoopFinalizationInput(input: {
  readonly resultProjection: RepairVerdictTerminalProjection;
  readonly notProvenClaims?: readonly string[];
}): LoopFinalizationInput {
  const projection = input.resultProjection;
  return deepFreeze({
    inputId: `${projection.projectionId}:loop-finalization-input`,
    resultProjectionId: projection.projectionId,
    resultTerminalStatus: projection.status,
    resultTerminalClassification: projection.terminalClassification,
    proofComplete: projection.status === "verified_with_repair" &&
      projection.missingProofItems.length === 0,
    originalFailurePreserved: projection.originalFailureStatus === "failed" &&
      projection.originalVerificationFailureId.length > 0,
    repairApplyPreserved: projection.repairApplyState.length > 0,
    postRepairVerificationPreserved: projection.postRepairVerificationState.length > 0,
    originalVerificationFailureId: projection.originalVerificationFailureId,
    originalFailureClass: projection.originalFailureClass,
    repairApplyState: projection.repairApplyState,
    postRepairVerificationState: projection.postRepairVerificationState,
    missingProofItems: [...projection.missingProofItems],
    notProvenClaims: unique([
      "loop-decision-is-not-terminal-truth",
      "stop-complete-requires-result-owned-verified-status",
      "continue-next-turn-is-not-success",
      "await-user-is-not-success",
      "rendered-output-is-not-success",
      ...projection.notProvenClaims,
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

export function createProductLoopCloseoutInput(input: {
  readonly resultProjection: RepairVerdictTerminalProjection;
  readonly loopDecision: LoopFinalizationDecision;
  readonly notProvenClaims?: readonly string[];
}): ProductLoopCloseoutInput {
  const projection = input.resultProjection;
  const decision = input.loopDecision;
  const expectedInputId = `${projection.projectionId}:loop-finalization-input`;
  const sourceMismatchClaims = decision.sourceInputId === expectedInputId
    ? []
    : ["product-closeout-source-mismatch"];

  return deepFreeze({
    inputId: `${decision.decisionId}:product-closeout-input`,
    loopDecisionId: decision.decisionId,
    resultProjectionId: projection.projectionId,
    resultTerminalStatus: projection.status,
    resultTerminalClassification: projection.terminalClassification,
    loopControlDecision: decision.decision,
    nextAction: decision.nextAction,
    pendingUserAction: decision.pendingUserAuthority,
    pendingVerification: decision.pendingVerification,
    pendingRepair: decision.pendingRepair,
    preservedOriginalFailure: {
      verificationFailureId: projection.originalVerificationFailureId,
      failureClass: projection.originalFailureClass,
      status: projection.originalFailureStatus,
    },
    preservedRepairFacts: {
      proposalId: projection.repairProposalId,
      authorityState: projection.repairAuthorityState,
      applyState: projection.repairApplyState,
      touchedTargetSummaries: [...projection.repairTouchedTargetSummaries],
      applyReceiptIds: [...projection.repairApplyReceiptIds],
    },
    verificationSummary: {
      postRepairState: projection.postRepairVerificationState,
      relevanceStatus: projection.postRepairRelevanceStatus,
      coverageStatus: projection.postRepairCoverageStatus,
      receiptIds: [...projection.postRepairReceiptIds],
    },
    missingProofItems: unique([
      ...projection.missingProofItems,
      ...decision.missingProofItems,
    ]),
    notProvenClaims: unique([
      "product-closeout-is-not-terminal-truth",
      "session-carry-forward-is-not-terminal-truth",
      "rendered-output-is-not-terminal-truth",
      "complete-closeout-requires-result-owned-verified-status",
      "awaiting-user-is-not-success",
      "continue-is-not-success",
      "missing-proof-cannot-be-hidden",
      "original-failure-must-remain-visible",
      ...projection.notProvenClaims,
      ...decision.notProvenClaims,
      ...sourceMismatchClaims,
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

export function projectProductLoopCloseout(input: {
  readonly closeoutInput: ProductLoopCloseoutInput;
  readonly notProvenClaims?: readonly string[];
}): ProductLoopCloseoutProjection {
  const closeout = input.closeoutInput;
  const status = productCloseoutStatusFor(closeout);
  const complete = status === "complete";

  return deepFreeze({
    closeoutId: `${closeout.inputId}:projection`,
    sourceInputId: closeout.inputId,
    status,
    resultOwnedTerminalStatus: closeout.resultTerminalStatus,
    resultOwnedTerminalClassification: closeout.resultTerminalClassification,
    loopOwnedControlDecision: closeout.loopControlDecision,
    complete,
    nextAction: closeout.nextAction,
    pendingHandoff: {
      userAction: closeout.pendingUserAction,
      verification: closeout.pendingVerification,
      repair: closeout.pendingRepair,
    },
    sessionCarryForwardFacts: productCloseoutSessionCarryForwardFacts(closeout, status),
    originalFailureSummary:
      `id=${closeout.preservedOriginalFailure.verificationFailureId}; class=${closeout.preservedOriginalFailure.failureClass}; status=${closeout.preservedOriginalFailure.status}`,
    repairChainSummary:
      `proposal=${closeout.preservedRepairFacts.proposalId}; authority=${closeout.preservedRepairFacts.authorityState}; apply=${closeout.preservedRepairFacts.applyState}; receipts=${closeout.preservedRepairFacts.applyReceiptIds.length}`,
    verificationSummary:
      `postRepair=${closeout.verificationSummary.postRepairState}; relevance=${closeout.verificationSummary.relevanceStatus}; coverage=${closeout.verificationSummary.coverageStatus}; receipts=${closeout.verificationSummary.receiptIds.length}`,
    missingProofItems: [...closeout.missingProofItems],
    notProvenClaims: unique([
      ...closeout.notProvenClaims,
      "product-closeout-is-not-terminal-truth",
      "product-closeout-complete-is-not-terminal-truth",
      ...(complete ? [] : ["incomplete-closeout-is-not-success"]),
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

export function decideLoopFinalization(input: {
  readonly finalizationInput: LoopFinalizationInput;
  readonly pendingHandoffFacts?: readonly string[];
  readonly notProvenClaims?: readonly string[];
}): LoopFinalizationDecision {
  const facts = input.pendingHandoffFacts ?? [];
  const missing = input.finalizationInput.missingProofItems;
  const decision = decide({
    status: input.finalizationInput.resultTerminalStatus,
    proofComplete: input.finalizationInput.proofComplete,
    missingProofItems: missing,
    pendingHandoffFacts: facts,
  });
  return deepFreeze({
    decisionId: `${input.finalizationInput.inputId}:decision`,
    sourceInputId: input.finalizationInput.inputId,
    decision,
    reason: reasonFor(decision, input.finalizationInput),
    nextAction: nextActionFor(decision, input.finalizationInput),
    pendingUserAuthority: decision === "await_user",
    pendingVerification: decision === "continue_verification",
    pendingRepair: decision === "continue_repair",
    sessionCarryForwardFacts: sessionCarryForwardFacts(input.finalizationInput, decision),
    originalVerificationFailureId: input.finalizationInput.originalVerificationFailureId,
    originalFailureClass: input.finalizationInput.originalFailureClass,
    missingProofItems: [...missing],
    notProvenClaims: unique([
      ...input.finalizationInput.notProvenClaims,
      "loop-decision-is-not-terminal-truth",
      "partial-blocked-failed-not-proven-cannot-stop-complete",
      "missing-proof-cannot-be-hidden",
      "original-failure-must-remain-visible",
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function decide(input: {
  readonly status: RepairVerdictTerminalProjection["status"];
  readonly proofComplete: boolean;
  readonly missingProofItems: readonly string[];
  readonly pendingHandoffFacts: readonly string[];
}): LoopFinalizationDecisionStatus {
  if (input.status === "verified_with_repair" && input.proofComplete) {
    return "stop_complete";
  }
  if (
    input.missingProofItems.includes("repair-authority") ||
    input.pendingHandoffFacts.some((fact) => fact.includes("authority"))
  ) {
    return "await_user";
  }
  if (
    input.missingProofItems.includes("post-repair-verification") ||
    input.missingProofItems.includes("post-repair-relevance") ||
    input.missingProofItems.includes("post-repair-coverage") ||
    input.missingProofItems.includes("post-repair-receipt")
  ) {
    return "continue_verification";
  }
  if (
    input.missingProofItems.includes("repair-proposal") ||
    input.missingProofItems.includes("repair-apply") ||
    input.missingProofItems.includes("repair-apply-receipt")
  ) {
    return "continue_repair";
  }
  if (input.status === "blocked") return "stop_blocked";
  if (input.status === "failed") return "stop_failed";
  if (input.status === "partial") return "continue_next_turn";
  if (input.status === "not_proven") return "not_proven";
  return "unsupported";
}

function productCloseoutStatusFor(
  input: ProductLoopCloseoutInput,
): ProductLoopCloseoutStatus {
  if (
    input.resultTerminalStatus === "verified_with_repair" &&
    input.loopControlDecision === "stop_complete" &&
    input.missingProofItems.length === 0
  ) {
    return "complete";
  }
  switch (input.loopControlDecision) {
    case "stop_failed":
      return "failed";
    case "stop_blocked":
      return "blocked";
    case "await_user":
      return "awaiting_user";
    case "continue_next_turn":
      return "continue_next_turn";
    case "continue_verification":
      return "continue_verification";
    case "continue_repair":
      return "continue_repair";
    case "unsupported":
      return "unsupported";
    case "not_proven":
      return "not_proven";
    case "stop_complete":
    default:
      return "not_proven";
  }
}

function reasonFor(
  decision: LoopFinalizationDecisionStatus,
  input: LoopFinalizationInput,
): string {
  switch (decision) {
    case "stop_complete":
      return "Result owner projected verified repair and proof is complete.";
    case "await_user":
      return "User authority or action is required before finalization can complete.";
    case "continue_verification":
      return "Post repair verification proof is incomplete.";
    case "continue_repair":
      return "Repair proof is incomplete.";
    case "stop_blocked":
      return "Result owner projected a blocked terminal status.";
    case "stop_failed":
      return "Result owner projected a failed terminal status.";
    case "continue_next_turn":
      return "Result owner projected partial status; carry facts forward.";
    case "not_proven":
      return "Result owner did not prove terminal completion.";
    case "unsupported":
    default:
      return `Unsupported result terminal status: ${input.resultTerminalStatus}.`;
  }
}

function nextActionFor(
  decision: LoopFinalizationDecisionStatus,
  input: LoopFinalizationInput,
): string {
  switch (decision) {
    case "stop_complete":
      return "stop loop after result-owned verified repair projection";
    case "await_user":
      return "request user authority or missing user action";
    case "continue_verification":
      return "continue with task-relevant post repair verification";
    case "continue_repair":
      return "continue repair handoff without claiming success";
    case "stop_blocked":
      return "stop blocked and preserve missing proof";
    case "stop_failed":
      return "stop failed and preserve original failure";
    case "continue_next_turn":
      return "continue next turn with preserved proof gaps";
    case "not_proven":
      return "keep terminal result not proven and preserve proof gaps";
    case "unsupported":
    default:
      return `preserve unsupported finalization status ${input.resultTerminalStatus}`;
  }
}

function sessionCarryForwardFacts(
  input: LoopFinalizationInput,
  decision: LoopFinalizationDecisionStatus,
): readonly string[] {
  return deepFreeze([
    `loop-finalization-decision:${decision}`,
    `result-owned-terminal-status:${input.resultTerminalStatus}`,
    `pending-next-action:${nextActionFor(decision, input)}`,
    `pending-user-authority:${decision === "await_user" ? "yes" : "no"}`,
    `pending-verification:${decision === "continue_verification" ? "yes" : "no"}`,
    `pending-repair:${decision === "continue_repair" ? "yes" : "no"}`,
    `preserved-original-failure:${input.originalVerificationFailureId}`,
    `preserved-original-failure-class:${input.originalFailureClass}`,
    `missing-proof-items:${input.missingProofItems.join(",") || "none"}`,
    "loop-finalization-terminal-success:false",
  ]);
}

function productCloseoutSessionCarryForwardFacts(
  input: ProductLoopCloseoutInput,
  status: ProductLoopCloseoutStatus,
): readonly string[] {
  return deepFreeze([
    `product-closeout-status:${status}`,
    `final-observed-status:${input.resultTerminalStatus}`,
    `result-owned-terminal-status:${input.resultTerminalStatus}`,
    `loop-owned-control-decision:${input.loopControlDecision}`,
    `next-action:${input.nextAction}`,
    `pending-user-action:${input.pendingUserAction ? "yes" : "no"}`,
    `pending-verification:${input.pendingVerification ? "yes" : "no"}`,
    `pending-repair:${input.pendingRepair ? "yes" : "no"}`,
    `original-failure:${input.preservedOriginalFailure.verificationFailureId}`,
    `original-failure-class:${input.preservedOriginalFailure.failureClass}`,
    `repair-chain:${input.preservedRepairFacts.proposalId}/${input.preservedRepairFacts.applyState}`,
    `verification-summary:${input.verificationSummary.postRepairState}/${input.verificationSummary.relevanceStatus}/${input.verificationSummary.coverageStatus}`,
    `not-proven-claims:${input.notProvenClaims.join(",") || "none"}`,
    `missing-proof-items:${input.missingProofItems.join(",") || "none"}`,
    "product-closeout-terminal-success:false",
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
