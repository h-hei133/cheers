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
      changedFileVerificationComplete: true,
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
      changedFileVerificationComplete: false,
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
      changedFileVerificationComplete: true,
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
      changedFileVerificationComplete: false,
      repairAttempted: false,
      repairPostValidation: "not-run",
      originalFailurePreserved: true,
      hostStatus: "passed",
    });

    expect(proof.status).toBe("complete");
    expect(proof.presentProof).toContain("continuation-freshness");
    expect(proof.terminalSuccessClaim).toBe(false);
  });

  it("rejects code completion when final verification is missing", () => {
    const proof = buildTaskProofInput({
      ...baseFacts(),
      caseId: "single-file-edit",
      taskKind: "coding-edit",
      outputKind: "diff",
      verificationState: "not-run",
      verificationEvidenceInputEligible: false,
      verificationResultInputEligible: false,
      hostStatus: "passed",
    });

    expect(proof.status).toBe("partial");
    expect(proof.missingProof).toEqual(
      expect.arrayContaining(["task-relevant-verification", "verification-passed", "result-input"]),
    );
  });

  it("rejects diff completion when changed-file verification is incomplete", () => {
    const proof = buildTaskProofInput({
      ...baseFacts(),
      caseId: "partial-target-check",
      taskKind: "coding-edit",
      outputKind: "diff",
      verificationState: "passed",
      verificationEvidenceInputEligible: true,
      verificationResultInputEligible: true,
      changedFileVerificationComplete: false,
      hostStatus: "passed",
    });

    expect(proof.status).toBe("partial");
    expect(proof.missingProof).toEqual(["changed-file-verification-complete"]);
  });

  it("rejects debug completion when post-repair validation is missing", () => {
    const proof = buildTaskProofInput({
      ...baseFacts(),
      caseId: "failed-check-repair",
      taskKind: "debug-repair",
      outputKind: "diff",
      verificationState: "partial",
      verificationEvidenceInputEligible: false,
      verificationResultInputEligible: false,
      repairAttempted: true,
      repairPostValidation: "not-run",
      originalFailurePreserved: true,
      hostStatus: "failed",
    });

    expect(proof.status).toBe("partial");
    expect(proof.missingProof).toEqual(
      expect.arrayContaining(["verification-passed", "repair-post-validation"]),
    );
  });

  it("rejects report completion when source receipts are missing", () => {
    const proof = buildTaskProofInput({
      ...baseFacts(),
      caseId: "source-report",
      taskKind: "docs-report",
      outputKind: "artifact",
      verificationState: "passed",
      verificationEvidenceInputEligible: true,
      verificationResultInputEligible: true,
      artifactSourceReceiptsAvailable: false,
      artifactCorrectionAttempted: true,
      artifactCorrectionValidationState: "validation-passed",
      hostStatus: "passed",
    });

    expect(proof.status).toBe("partial");
    expect(proof.missingProof).toEqual(["artifact-source-receipts"]);
  });

  it("rejects structured artifacts when format validation fails", () => {
    const proof = buildTaskProofInput({
      ...baseFacts(),
      caseId: "structured-artifact",
      taskKind: "data-artifact",
      outputKind: "artifact",
      verificationState: "failed",
      verificationEvidenceInputEligible: false,
      verificationResultInputEligible: false,
      artifactSourceReceiptsAvailable: true,
      artifactValidationState: "validation-failed",
      artifactCorrectionAttempted: true,
      artifactCorrectionValidationState: "validation-failed",
      hostStatus: "failed",
    });

    expect(proof.status).toBe("failed");
    expect(proof.missingProof).toEqual(
      expect.arrayContaining(["verification-passed", "artifact-validation", "result-input"]),
    );
  });

  it("rejects continuation completion when retained context is stale", () => {
    const proof = buildTaskProofInput({
      ...baseFacts(),
      caseId: "resume-from-context",
      taskKind: "continuation",
      outputKind: "continuation",
      verificationState: "partial",
      verificationEvidenceInputEligible: false,
      verificationResultInputEligible: false,
      contextRefreshed: false,
      hostStatus: "passed",
    });

    expect(proof.status).toBe("partial");
    expect(proof.missingProof).toEqual(
      expect.arrayContaining(["continuation-freshness", "result-input"]),
    );
  });

  it("rejects host output when task proof is absent", () => {
    const proof = buildTaskProofInput({
      ...baseFacts(),
      caseId: "host-output-only",
      taskKind: "coding-edit",
      outputKind: "diff",
      contextState: "partial",
      selectedPathCount: 0,
      planState: "blocked",
      requestState: "blocked",
      toolStrategyState: "blocked",
      verificationState: "not-run",
      verificationEvidenceInputEligible: false,
      verificationResultInputEligible: false,
      hostStatus: "passed",
    });

    expect(proof.status).toBe("blocked");
    expect(proof.missingProof).toEqual(
      expect.arrayContaining([
        "context-ready",
        "plan-ready",
        "request-ready",
        "tool-strategy-ready",
        "task-relevant-verification",
        "verification-passed",
        "result-input",
      ]),
    );
  });

  it("rejects artifact presence without validation", () => {
    const proof = buildTaskProofInput({
      ...baseFacts(),
      caseId: "artifact-exists-only",
      taskKind: "docs-report",
      outputKind: "artifact",
      verificationState: "not-run",
      verificationEvidenceInputEligible: false,
      verificationResultInputEligible: false,
      artifactSourceReceiptsAvailable: true,
      artifactValidationState: "intent-created",
      artifactCorrectionAttempted: false,
      artifactCorrectionValidationState: "intent-created",
      hostStatus: "passed",
    });

    expect(proof.status).toBe("partial");
    expect(proof.missingProof).toEqual(
      expect.arrayContaining(["task-relevant-verification", "verification-passed", "artifact-validation", "result-input"]),
    );
  });
});

function baseFacts() {
  return {
    caseId: "case",
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
    changedFileVerificationComplete: true,
    repairAttempted: false,
    repairPostValidation: "not-run",
    originalFailurePreserved: true,
    hostStatus: "passed",
  };
}
