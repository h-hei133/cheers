import { describe, expect, it } from "vitest";

import { buildTaskProofInput } from "./proof.js";

describe("task proof input", () => {
  it("builds complete proof for debug repair only after repair and post-validation pass", () => {
    const proof = buildTaskProofInput({
      caseId: "failed-check-repair",
      taskKind: "debug-repair",
      outputKind: "diff",
      contextState: "ready",
      contextRefreshed: false,
      selectedPathCount: 2,
      planState: "ready",
      requestState: "ready",
      toolStrategyState: "ready",
      verificationState: "passed",
      verificationEvidenceInputEligible: true,
      verificationResultInputEligible: true,
      repairAttempted: true,
      repairPostValidation: "passed",
      originalFailurePreserved: true,
      hostStatus: "failed",
    });

    expect(proof.status).toBe("complete");
    expect(proof.missingProof).toEqual([]);
    expect(proof.requiredProof).toEqual(
      expect.arrayContaining(["repair-action", "repair-post-validation", "original-failure-preserved"]),
    );
    expect(proof.terminalSuccessClaim).toBe(false);
  });

  it("keeps partial repair incomplete when post-validation is partial", () => {
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
      repairAttempted: true,
      repairPostValidation: "partial",
      originalFailurePreserved: true,
      hostStatus: "failed",
    });

    expect(proof.status).toBe("partial");
    expect(proof.missingProof).toEqual(expect.arrayContaining(["verification-passed", "repair-post-validation"]));
  });

  it("builds artifact proof from source receipts and validation", () => {
    const proof = buildTaskProofInput({
      caseId: "structured-artifact",
      taskKind: "data-artifact",
      outputKind: "artifact",
      contextState: "ready",
      contextRefreshed: false,
      selectedPathCount: 2,
      planState: "ready",
      requestState: "ready",
      toolStrategyState: "ready",
      verificationState: "passed",
      verificationEvidenceInputEligible: true,
      verificationResultInputEligible: true,
      repairAttempted: false,
      repairPostValidation: "not-run",
      originalFailurePreserved: true,
      artifactValidationState: "validation-failed",
      artifactSourceReceiptsAvailable: true,
      artifactCorrectionAttempted: true,
      artifactCorrectionValidationState: "validation-passed",
      hostStatus: "passed",
    });

    expect(proof.status).toBe("complete");
    expect(proof.presentProof).toEqual(expect.arrayContaining(["artifact-source-receipts", "artifact-validation"]));
  });

  it("uses refreshed context as continuation proof without treating context alone as terminal success", () => {
    const proof = buildTaskProofInput({
      caseId: "resume-from-context",
      taskKind: "continuation",
      outputKind: "continuation",
      contextState: "ready",
      contextRefreshed: true,
      selectedPathCount: 2,
      planState: "ready",
      requestState: "ready",
      toolStrategyState: "ready",
      verificationState: "partial",
      verificationEvidenceInputEligible: false,
      verificationResultInputEligible: false,
      repairAttempted: false,
      repairPostValidation: "not-run",
      originalFailurePreserved: true,
      hostStatus: "passed",
    });

    expect(proof.status).toBe("complete");
    expect(proof.presentProof).toContain("continuation-freshness");
    expect(proof.terminalSuccessClaim).toBe(false);
  });
});
