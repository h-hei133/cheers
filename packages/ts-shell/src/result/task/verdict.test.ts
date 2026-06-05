import { describe, expect, it } from "vitest";

import { buildTaskProofInput } from "../../evidence/task/proof.js";
import { projectTaskVerdict } from "./verdict.js";

describe("task result verdict", () => {
  it("projects complete only from complete task proof", () => {
    const proof = buildTaskProofInput({
      caseId: "source-report",
      taskKind: "docs-report",
      outputKind: "artifact",
      contextState: "ready",
      contextRefreshed: false,
      selectedPathCount: 3,
      planState: "ready",
      requestState: "ready",
      toolStrategyState: "ready",
      verificationState: "passed",
      verificationEvidenceInputEligible: true,
      verificationResultInputEligible: true,
      changedFileVerificationComplete: true,
      repairAttempted: false,
      repairPostValidation: "not-run",
      originalFailurePreserved: true,
      artifactValidationState: "invalid",
      artifactSourceReceiptsAvailable: true,
      artifactCorrectionAttempted: true,
      artifactCorrectionValidationState: "validation-passed",
      hostStatus: "not-proven",
    });

    const verdict = projectTaskVerdict({ proof });

    expect(verdict.status).toBe("complete");
    expect(verdict.completeProof).toBe(true);
    expect(verdict.terminalClassification).toBe("success");
    expect(verdict.terminalSuccessClaim).toBe(false);
  });

  it("does not let incomplete proof become complete", () => {
    const proof = buildTaskProofInput({
      caseId: "rollback-recovery",
      taskKind: "debug-repair",
      outputKind: "diff",
      contextState: "ready",
      contextRefreshed: false,
      selectedPathCount: 3,
      planState: "ready",
      requestState: "ready",
      toolStrategyState: "ready",
      verificationState: "partial",
      verificationEvidenceInputEligible: false,
      verificationResultInputEligible: false,
      changedFileVerificationComplete: false,
      repairAttempted: true,
      repairPostValidation: "partial",
      originalFailurePreserved: true,
      hostStatus: "failed",
    });

    const verdict = projectTaskVerdict({ proof });

    expect(verdict.status).toBe("partial");
    expect(verdict.completeProof).toBe(false);
    expect(verdict.missingProof).toEqual(expect.arrayContaining(["verification-passed"]));
    expect(verdict.notProvenClaims).toContain("missing-task-complete-proof");
  });

  it("reports exact missing proof as not-proven claims", () => {
    const proof = buildTaskProofInput({
      caseId: "partial-target-check",
      taskKind: "coding-edit",
      outputKind: "diff",
      contextState: "ready",
      contextRefreshed: false,
      selectedPathCount: 1,
      planState: "ready",
      requestState: "ready",
      toolStrategyState: "ready",
      verificationState: "passed",
      verificationEvidenceInputEligible: true,
      verificationResultInputEligible: true,
      changedFileVerificationComplete: false,
      repairAttempted: false,
      repairPostValidation: "not-run",
      originalFailurePreserved: true,
      hostStatus: "passed",
    });

    const verdict = projectTaskVerdict({ proof });

    expect(verdict.completeProof).toBe(false);
    expect(verdict.notProvenClaims).toContain(
      "missing-proof:changed-file-verification-complete",
    );
  });
});
