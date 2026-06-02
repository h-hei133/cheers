import { describe, expect, it } from "vitest";

import {
  createRepairApplyRequest,
  observeRepairApply,
  observeRepairAuthority,
  observeRepairProposal,
  projectRepairRequiredHandoff,
} from "../../../repair/handoff/boundary.js";
import { PRODUCT_TRUTH_MATRIX, PRODUCT_TRUTH_NEGATIVE_CASES } from "../../../runtime/loop/truthMatrix.test.js";
import {
  observePostRepairVerificationResult,
  observeVerificationResult,
  projectVerificationIntent,
  requestPostRepairVerification,
  requirePostRepairVerification,
} from "../../../verification/result/boundary.js";
import { buildRepairVerdictProofInput } from "./verdict.js";

describe("repair verdict proof input", () => {
  it("builds complete evidence input from a preserved post repair verification candidate", () => {
    const postRepairVerification = makePostRepairVerification();
    const proofInput = buildRepairVerdictProofInput({ postRepairVerification });

    expect(proofInput).toMatchObject({
      verdictCandidateId: postRepairVerification.verdictCandidateInput?.candidateId,
      sourcePostRepairVerificationResultId: postRepairVerification.resultId,
      originalVerificationFailureId: postRepairVerification.sourceVerificationFailureId,
      originalFailureClass: "test-failed",
      originalFailureStatus: "failed",
      repairProposalId: postRepairVerification.sourceRepairProposalId,
      repairAuthorityState: "granted",
      repairApplyState: "applied",
      postRepairVerificationState: "passed",
      postRepairRelevanceStatus: "task_relevant",
      postRepairCoverageStatus: "covered",
      missingProofItems: [],
      proofStatus: "complete",
      originalFailurePreserved: true,
      repairApplyPreserved: true,
      evidenceInputOnly: true,
      terminalSuccessClaim: false,
    });
    expect(proofInput.originalReceiptIds).toEqual(["receipt-original"]);
    expect(proofInput.repairApplyReceiptIds).toEqual(["receipt-apply"]);
    expect(proofInput.postRepairReceiptIds).toEqual(["receipt-post-repair"]);
    expect(proofInput.notProvenClaims).toContain(
      "evidence-input-is-not-terminal-result",
    );
  });

  it("keeps incomplete proof from becoming complete", () => {
    const proofInput = buildRepairVerdictProofInput({
      postRepairVerification: makePostRepairVerification({
        status: "passed",
        receiptIds: [],
        coverageStatus: "partially_covered",
      }),
    });

    expect(proofInput.proofStatus).toBe("incomplete");
    expect(proofInput.missingProofItems).toEqual(
      expect.arrayContaining(["post-repair-coverage", "post-repair-receipt"]),
    );
    expect(proofInput.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify(proofInput)).not.toContain('"success":true');
  });

  it.each(PRODUCT_TRUTH_MATRIX)(
    "matches shared product truth matrix proof input for $name",
    (item) => {
      expect(item.expected.missingProofItems).toEqual(
        expect.arrayContaining(item.repairVerdictProofInput.missingProofItems),
      );
      expect(item.repairVerdictProofInput.terminalSuccessClaim).toBe(false);
      expect(item.repairVerdictProofInput.evidenceInputOnly).toBe(true);
      expect(item.repairVerdictProofInput.proofStatus === "complete").toBe(
        item.expected.terminalSuccess,
      );
    },
  );

  it.each(PRODUCT_TRUTH_NEGATIVE_CASES)(
    "keeps shared non-success matrix proof input incomplete for $name",
    (item) => {
      expect(item.repairVerdictProofInput.proofStatus).not.toBe("complete");
      expect(item.repairVerdictProofInput.notProvenClaims).toContain(
        "evidence-input-is-not-terminal-result",
      );
      expect(JSON.stringify(item.repairVerdictProofInput)).not.toContain('"success":true');
    },
  );
});

function makePostRepairVerification(input: {
  readonly status?: "passed" | "failed" | "blocked" | "not_run";
  readonly receiptIds?: readonly string[];
  readonly coverageStatus?: "covered" | "partially_covered" | "uncovered" | "not_proven";
} = {}) {
  const intent = projectVerificationIntent({
    sourceTurnId: "turn-repair-verdict-proof",
    targetSummary: "verify repaired target",
    dispatchStatus: "failed",
    relevanceStatus: "task_relevant",
    coverageStatus: "covered",
    authorityRequirement: "granted",
  });
  const result = observeVerificationResult({
    intent,
    status: "failed",
    failureClass: "test-failed",
    repairEligible: true,
    runtimeReceiptIds: ["receipt-original"],
  });
  const handoff = projectRepairRequiredHandoff({ verification: result });
  const proposal = observeRepairProposal({
    handoff,
    proposalSource: "deterministic_from_failure_evidence",
    readinessStatus: "exact_ready",
  });
  const authority = observeRepairAuthority({
    proposal,
    authorityDecision: "granted",
    authoritySource: "explicit_repair_authority",
  });
  const applyRequest = createRepairApplyRequest({
    proposal,
    authority,
    expectedEditOperationKind: "hunk_set",
  });
  const apply = observeRepairApply({
    proposal,
    authority,
    request: applyRequest,
    editApplyObservation: {
      status: "hunk-set-applied",
      changedFiles: ["src/app.ts"],
      evidence: ["receipt-apply"],
    },
    applyReceiptIds: ["receipt-apply"],
  });
  const requirement = requirePostRepairVerification({ repairApply: apply });
  const request = requestPostRepairVerification({
    requirement,
    dispatchStatus: "dispatched",
    receiptIds: input.receiptIds ?? ["receipt-post-repair"],
  });
  return observePostRepairVerificationResult({
    requirement,
    request,
    status: input.status ?? "passed",
    receiptIds: input.receiptIds ?? ["receipt-post-repair"],
    coverageStatus: input.coverageStatus ?? "covered",
  });
}
