import { describe, expect, it } from "vitest";

import type { RepairVerdictProofInput } from "../../evidence/projection/repair/verdict.js";
import type {
  RepairApplyObservation,
  RepairAuthorityObservation,
  RepairProposalObservation,
  RepairRequiredHandoff,
} from "../../repair/handoff/boundary.js";
import type { RepairVerdictTerminalProjection } from "../../result/projection/repair/verdict.js";
import type { PostRepairVerificationResultObservation } from "../../verification/result/boundary.js";
import type {
  LoopFinalizationDecision,
  ProductLoopCloseoutProjection,
} from "./finalization.js";
import { buildProductCompletionPacket } from "./completionPacket.js";

describe("product completion packet", () => {
  it("builds a complete packet only from the full verified repair chain", () => {
    const packet = buildProductCompletionPacket(completeInput());

    expect(packet).toMatchObject({
      status: "complete",
      complete: true,
      resultProjectionId: "result:repair",
      resultOwnedTerminalStatus: "verified_with_repair",
      loopDecision: "stop_complete",
      closeoutState: "complete",
      terminalSuccessClaim: false,
    });
    expect(packet.originalFailure.summary).toContain("verification:failed");
    expect(packet.repairRequiredFacts).toMatchObject({
      handoffId: "repair:required",
      repairEligible: true,
    });
    expect(packet.proposalFacts).toMatchObject({
      proposalId: "repair:proposal",
      readinessStatus: "exact_ready",
    });
    expect(packet.authorityFacts).toMatchObject({
      authorityDecision: "granted",
    });
    expect(packet.applyObservationFacts).toMatchObject({
      repairApplyStatus: "applied",
      applyAttempted: true,
    });
    expect(packet.postRepairVerificationFacts).toMatchObject({
      resultStatus: "passed",
      taskRelevanceStatus: "task_relevant",
      coverageStatus: "covered",
    });
    expect(packet.sessionCarryForwardFacts).toEqual(
      expect.arrayContaining([
        "product-completion-packet-status:complete",
        "final-observed-result-status:verified_with_repair",
        "loop-decision:stop_complete",
        "closeout-state:complete",
        "product-completion-packet-terminal-success:false",
      ]),
    );
    expect(
      packet.sessionCarryForwardFacts.some((fact) =>
        fact.includes("product-completion-packet-is-not-terminal-truth")
      ),
    ).toBe(true);
    expect(packet.notProvenClaims).toContain(
      "product-completion-packet-is-not-terminal-truth",
    );
  });

  it.each([
    ["missing authority", completeInput({ repairAuthority: authority({ authorityDecision: "missing" }) })],
    ["missing apply", completeInput({ repairApply: undefined })],
    ["missing post repair verification", completeInput({ postRepairVerificationResult: undefined })],
    [
      "failed post repair verification",
      completeInput({
        postRepairVerificationResult: postRepairResult({ status: "failed" }),
      }),
    ],
    [
      "verdict candidate only",
      completeInput({
        repairVerdictProofInput: proofInput({ proofStatus: "incomplete" }),
      }),
    ],
    [
      "closeout only",
      completeInput({
        repairRequired: undefined,
        repairProposal: undefined,
        repairAuthority: undefined,
        repairApply: undefined,
        postRepairVerificationResult: undefined,
        repairVerdictProofInput: undefined,
      }),
    ],
  ])("does not complete for %s", (_label, input) => {
    const packet = buildProductCompletionPacket(input);

    expect(packet.complete).toBe(false);
    expect(packet.status).not.toBe("complete");
    expect(packet.missingProofItems.length).toBeGreaterThan(0);
    expect(packet.notProvenClaims).toContain(
      "incomplete-proof-cannot-become-complete",
    );
    expect(packet.notProvenClaims).toContain(
      "product-completion-packet-is-not-complete",
    );
    expect(packet.originalFailure.summary).toContain("verification:failed");
    expect(packet.terminalSuccessClaim).toBe(false);
  });
});

function completeInput(
  overrides: Partial<Parameters<typeof buildProductCompletionPacket>[0]> = {},
): Parameters<typeof buildProductCompletionPacket>[0] {
  return {
    resultProjection: resultProjection(),
    loopDecision: loopDecision(),
    closeout: closeout(),
    repairRequired: repairRequired(),
    repairProposal: proposal(),
    repairAuthority: authority(),
    repairApply,
    postRepairVerificationResult: postRepairResult(),
    repairVerdictProofInput: proofInput(),
    ...overrides,
  };
}

function resultProjection(
  overrides: Partial<RepairVerdictTerminalProjection> = {},
): RepairVerdictTerminalProjection {
  return {
    projectionId: "result:repair",
    sourceProofInputId: "proof:repair",
    status: "verified_with_repair",
    terminalClassification: "success",
    productVerdict: {
      status: "COMPLETE",
      terminalClassification: "success",
      reason: "result owner verified repair",
      provenance: { source: "product-runtime", adapter: "repair-verdict" },
      redaction: "raw-content-excluded",
      cleanup: "not-applicable",
      notProvenReasons: [],
      partialReasons: [],
      blockedReasons: [],
    },
    originalVerificationFailureId: "verification:failed",
    originalFailureClass: "test-failed",
    originalFailureStatus: "failed",
    originalReceiptIds: ["receipt:original"],
    repairProposalId: "repair:proposal",
    repairAuthorityState: "granted",
    repairApplyState: "applied",
    repairTouchedTargetSummaries: ["src/module.ts"],
    repairApplyReceiptIds: ["receipt:apply"],
    postRepairVerificationState: "passed",
    postRepairRelevanceStatus: "task_relevant",
    postRepairCoverageStatus: "covered",
    postRepairReceiptIds: ["receipt:post"],
    missingProofItems: [],
    notProvenClaims: ["result-owner-terminal-projection"],
    terminalSuccessClaim: false,
    ...overrides,
  };
}

function loopDecision(
  overrides: Partial<LoopFinalizationDecision> = {},
): LoopFinalizationDecision {
  return {
    decisionId: "loop:decision",
    sourceInputId: "loop:input",
    decision: "stop_complete",
    reason: "result owner verified repair",
    nextAction: "stop loop after result-owned verified repair projection",
    pendingUserAuthority: false,
    pendingVerification: false,
    pendingRepair: false,
    sessionCarryForwardFacts: ["loop-finalization-terminal-success:false"],
    originalVerificationFailureId: "verification:failed",
    originalFailureClass: "test-failed",
    missingProofItems: [],
    notProvenClaims: ["loop-decision-is-not-terminal-truth"],
    terminalSuccessClaim: false,
    ...overrides,
  };
}

function closeout(
  overrides: Partial<ProductLoopCloseoutProjection> = {},
): ProductLoopCloseoutProjection {
  return {
    closeoutId: "closeout:repair",
    sourceInputId: "closeout:input",
    status: "complete",
    resultOwnedTerminalStatus: "verified_with_repair",
    resultOwnedTerminalClassification: "success",
    loopOwnedControlDecision: "stop_complete",
    complete: true,
    nextAction: "stop loop after result-owned verified repair projection",
    pendingHandoff: { userAction: false, verification: false, repair: false },
    sessionCarryForwardFacts: ["product-closeout-terminal-success:false"],
    originalFailureSummary: "id=verification:failed; class=test-failed; status=failed",
    repairChainSummary: "proposal=repair:proposal; authority=granted; apply=applied; receipts=1",
    verificationSummary: "postRepair=passed; relevance=task_relevant; coverage=covered; receipts=1",
    missingProofItems: [],
    notProvenClaims: ["product-closeout-is-not-terminal-truth"],
    terminalSuccessClaim: false,
    ...overrides,
  };
}

function repairRequired(
  overrides: Partial<RepairRequiredHandoff> = {},
): RepairRequiredHandoff {
  return {
    handoffId: "repair:required",
    sourceVerificationId: "verification:failed",
    failureClass: "test-failed",
    originalFailureSummary: "verification:failed failed before repair",
    taskRelevanceStatus: "task_relevant",
    coverageStatus: "covered",
    authorityRequirement: "required",
    authorityState: "granted",
    runtimeReceiptIds: ["receipt:original"],
    repairEligible: true,
    repairabilityStatus: "repairable",
    repairBlocker: "none",
    repairRisk: "low",
    suggestedRepairMode: "manual_patch",
    originalFailurePreserved: true,
    redactionStatus: "report-safe",
    notProvenClaims: ["repair-required-is-not-success"],
    terminalSuccessClaim: false,
    ...overrides,
  };
}

function proposal(
  overrides: Partial<RepairProposalObservation> = {},
): RepairProposalObservation {
  return {
    proposalId: "repair:proposal",
    sourceFailureId: "verification:failed",
    sourceVerificationId: "verification:failed",
    proposalSource: "local_deterministic",
    originalFailureClass: "test-failed",
    originalFailureSummary: "verification:failed failed before repair",
    taskRelevanceStatus: "task_relevant",
    coverageStatus: "covered",
    runtimeReceiptIds: ["receipt:original"],
    targetSummary: "src/module.ts",
    readinessStatus: "exact_ready",
    proposalRisk: "low",
    authorityRequirement: "required",
    applyStatus: "not_applied",
    postRepairVerificationStatus: "not_run",
    redactionStatus: "report-safe",
    notProvenClaims: ["repair-proposal-is-not-success"],
    terminalSuccessClaim: false,
    ...overrides,
  };
}

function authority(
  overrides: Partial<RepairAuthorityObservation> = {},
): RepairAuthorityObservation {
  return {
    authorityId: "repair:authority",
    proposalId: "repair:proposal",
    sourceFailureId: "verification:failed",
    sourceVerificationId: "verification:failed",
    authorityRequired: true,
    authorityDecision: "granted",
    authoritySource: "explicit_user",
    authorityMissingReason: "none",
    originalFailureClass: "test-failed",
    originalFailureSummary: "verification:failed failed before repair",
    taskRelevanceStatus: "task_relevant",
    coverageStatus: "covered",
    runtimeReceiptIds: ["receipt:original"],
    authorityRisk: "low",
    redactionStatus: "report-safe",
    notProvenClaims: ["repair-authority-is-not-success"],
    terminalSuccessClaim: false,
    ...overrides,
  };
}

const repairApply: RepairApplyObservation = {
  repairApplyId: "repair:apply",
  proposalId: "repair:proposal",
  sourceFailureId: "verification:failed",
  sourceVerificationId: "verification:failed",
  originalFailureClass: "test-failed",
  originalFailureSummary: "verification:failed failed before repair",
  originalFailurePreserved: true,
  taskRelevanceStatus: "task_relevant",
  coverageStatus: "covered",
  runtimeReceiptIds: ["receipt:original"],
  targetSummary: "src/module.ts",
  authorityState: "granted",
  authoritySource: "explicit_user",
  applyReadiness: "ready",
  applyBlocker: "none",
  applyAttempted: true,
  repairApplyStatus: "applied",
  repairAuthorityStatus: "granted",
  applyReceiptIds: ["receipt:apply"],
  touchedTargetSummaries: ["src/module.ts"],
  postRepairVerificationStatus: "pending",
  redactionStatus: "report-safe",
  notProvenClaims: ["repair-apply-is-not-success"],
  terminalSuccessClaim: false,
};

function postRepairResult(
  overrides: Partial<PostRepairVerificationResultObservation> = {},
): PostRepairVerificationResultObservation {
  return {
    resultId: "post:result",
    requirementId: "post:requirement",
    requestId: "post:request",
    sourceRepairApplyId: "repair:apply",
    sourceRepairProposalId: "repair:proposal",
    sourceVerificationFailureId: "verification:failed",
    sourceVerificationId: "verification:failed",
    status: "passed",
    failureClass: "none",
    taskRelevanceStatus: "task_relevant",
    coverageStatus: "covered",
    receiptIds: ["receipt:post"],
    originalFailureClass: "test-failed",
    originalFailureSummary: "verification:failed failed before repair",
    originalFailureStatus: "failed",
    originalTaskRelevanceStatus: "task_relevant",
    originalCoverageStatus: "covered",
    originalRuntimeReceiptIds: ["receipt:original"],
    originalFailurePreserved: true,
    repairApplyPreserved: true,
    repairApplyState: "applied",
    repairAuthorityState: "granted",
    repairApplyReceiptIds: ["receipt:apply"],
    touchedTargetSummaries: ["src/module.ts"],
    redactionStatus: "report-safe",
    notProvenClaims: ["post-repair-verification-is-not-success"],
    terminalSuccessClaim: false,
    ...overrides,
  };
}

function proofInput(
  overrides: Partial<RepairVerdictProofInput> = {},
): RepairVerdictProofInput {
  return {
    proofInputId: "proof:repair",
    verdictCandidateId: "candidate:post",
    sourcePostRepairVerificationResultId: "post:result",
    originalVerificationFailureId: "verification:failed",
    originalFailureClass: "test-failed",
    originalFailureStatus: "failed",
    originalReceiptIds: ["receipt:original"],
    repairProposalId: "repair:proposal",
    repairAuthorityState: "granted",
    repairApplyState: "applied",
    repairTouchedTargetSummaries: ["src/module.ts"],
    repairApplyReceiptIds: ["receipt:apply"],
    postRepairVerificationState: "passed",
    postRepairRelevanceStatus: "task_relevant",
    postRepairCoverageStatus: "covered",
    postRepairReceiptIds: ["receipt:post"],
    proofStatus: "complete",
    originalFailurePreserved: true,
    repairApplyPreserved: true,
    evidenceInputOnly: true,
    missingProofItems: [],
    notProvenClaims: ["evidence-input-is-not-terminal-result"],
    terminalSuccessClaim: false,
    ...overrides,
  };
}
