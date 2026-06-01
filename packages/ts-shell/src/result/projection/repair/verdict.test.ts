import { describe, expect, it } from "vitest";

import type { RepairVerdictProofInput } from "../../../evidence/projection/repair/verdict.js";
import { projectRepairVerdictTerminal } from "./verdict.js";

describe("repair verdict terminal projection", () => {
  it("projects verified with repair only from complete evidence proof", () => {
    const projection = projectRepairVerdictTerminal({
      proofInput: proofInput(),
    });

    expect(projection).toMatchObject({
      status: "verified_with_repair",
      terminalClassification: "success",
      originalVerificationFailureId: "verification:failed",
      originalFailureClass: "test-failed",
      originalFailureStatus: "failed",
      repairProposalId: "repair:proposal",
      repairAuthorityState: "granted",
      repairApplyState: "applied",
      postRepairVerificationState: "passed",
      postRepairRelevanceStatus: "task_relevant",
      postRepairCoverageStatus: "covered",
      missingProofItems: [],
      terminalSuccessClaim: false,
    });
    expect(projection.productVerdict).toMatchObject({
      status: "COMPLETE",
      terminalClassification: "success",
    });
  });

  it("keeps missing proof partial and preserves missing items", () => {
    const projection = projectRepairVerdictTerminal({
      proofInput: proofInput({
        proofStatus: "incomplete",
        missingProofItems: ["post-repair-coverage", "post-repair-receipt"],
        postRepairCoverageStatus: "partially_covered",
        postRepairReceiptIds: [],
      }),
    });

    expect(projection.status).toBe("partial");
    expect(projection.terminalClassification).toBe("stopped");
    expect(projection.productVerdict.status).not.toBe("COMPLETE");
    expect(projection.missingProofItems).toEqual([
      "post-repair-coverage",
      "post-repair-receipt",
    ]);
    expect(projection.notProvenClaims).toContain(
      "incomplete-proof-cannot-be-verified",
    );
  });

  it("does not verify repair applied only or verdict candidate only", () => {
    const repairAppliedOnly = projectRepairVerdictTerminal({
      proofInput: proofInput({
        proofStatus: "not_proven",
        postRepairVerificationState: "not_run",
        missingProofItems: ["post-repair-verification"],
      }),
    });
    const verdictCandidateOnly = projectRepairVerdictTerminal({
      proofInput: proofInput({
        proofStatus: "incomplete",
        repairApplyState: "not_applied",
        missingProofItems: ["repair-apply"],
      }),
    });

    expect(repairAppliedOnly.status).toBe("not_proven");
    expect(verdictCandidateOnly.status).toBe("partial");
    expect(repairAppliedOnly.productVerdict.status).not.toBe("COMPLETE");
    expect(verdictCandidateOnly.productVerdict.status).not.toBe("COMPLETE");
  });
});

function proofInput(
  overrides: Partial<RepairVerdictProofInput> = {},
): RepairVerdictProofInput {
  return {
    proofInputId: "proof:repair",
    verdictCandidateId: "candidate:repair",
    sourcePostRepairVerificationResultId: "post-repair:result",
    originalVerificationFailureId: "verification:failed",
    originalFailureClass: "test-failed",
    originalFailureStatus: "failed",
    originalReceiptIds: ["receipt-original"],
    repairProposalId: "repair:proposal",
    repairAuthorityState: "granted",
    repairApplyState: "applied",
    repairTouchedTargetSummaries: ["src/app.ts"],
    repairApplyReceiptIds: ["receipt-apply"],
    postRepairVerificationState: "passed",
    postRepairRelevanceStatus: "task_relevant",
    postRepairCoverageStatus: "covered",
    postRepairReceiptIds: ["receipt-post-repair"],
    missingProofItems: [],
    proofStatus: "complete",
    originalFailurePreserved: true,
    repairApplyPreserved: true,
    evidenceInputOnly: true,
    notProvenClaims: ["evidence-input-is-not-terminal-result"],
    terminalSuccessClaim: false,
    ...overrides,
  };
}
