import { describe, expect, it } from "vitest";

import { projectRepairIteration } from "./projection.js";

describe("repairFacade", () => {
  it("requires repaired apply and same-command re-verification for success", () => {
    const projection = projectRepairIteration({
      originalFailurePreserved: true,
      repairProposalSource: "deterministic-from-failure-evidence",
      confirmationSource: "explicit-authority-contract",
      applyStatus: "single-target-applied",
      postRepairVerificationStatus: "passed",
      sameVerificationCommandRerun: true,
      retryCount: 1,
      maxRepairAttempts: 1,
      changedFiles: ["src/repair.ts"],
      notProvenClaims: ["live provider repair proposal"],
      finalRepairVerdict: "verified-success-with-repair",
      verificationFailureSummary: "test failed: expected status to be ready",
    });

    expect(projection.verdict.status).toBe("COMPLETE");
    expect(projection.failureOutputUsedForRetry).toBe(true);
    expect(projection.verificationFailureSummary).toBe(
      "test failed: expected status to be ready",
    );
    expect(projection.failureDiagnosis).toBe(
      "test failed: expected status to be ready",
    );
    expect(projection.repairAction).toBe(
      "generate bounded repair from failure diagnosis",
    );
    expect(projection.reverifyAction).toBe(
      "rerun same verification command after repair",
    );
    expect(projection.repairProposalIsSuccess).toBe(false);
    expect(projection.repairApplyWithoutReverifyIsSuccess).toBe(false);
  });

  it("does not make a repair proposal or apply success without reverify", () => {
    const projection = projectRepairIteration({
      originalFailurePreserved: true,
      repairProposalSource: "deterministic-from-failure-evidence",
      confirmationSource: "explicit-authority-contract",
      applyStatus: "single-target-applied",
      postRepairVerificationStatus: "failed",
      sameVerificationCommandRerun: true,
      retryCount: 1,
      maxRepairAttempts: 1,
      changedFiles: ["src/repair.ts"],
      notProvenClaims: ["repair success", "post-repair verification passed"],
      finalRepairVerdict: "repair-failed",
      verificationFailureSummary: "test failed: expected status to be ready",
    });

    expect(projection.verdict.status).toBe("PARTIAL");
    expect(projection.notProvenClaims).toContain("repair success");
    expect(projection.repairApplyWithoutReverifyIsSuccess).toBe(false);
  });

  it("blocks repair success when the same verification command is not rerun", () => {
    const projection = projectRepairIteration({
      originalFailurePreserved: true,
      repairProposalSource: "deterministic-from-failure-evidence",
      confirmationSource: "explicit-authority-contract",
      applyStatus: "single-target-applied",
      postRepairVerificationStatus: "passed",
      sameVerificationCommandRerun: false,
      retryCount: 1,
      maxRepairAttempts: 1,
      changedFiles: ["src/repair.ts"],
      notProvenClaims: ["same verification command rerun"],
      finalRepairVerdict: "repair-not-proven",
      verificationFailureSummary: "test failed: expected status to be ready",
    });

    expect(projection.verdict.status).toBe("NOT_PROVEN");
    expect(projection.verdict.notProvenReasons).toContain(
      "same verification command was not rerun",
    );
  });

  it("does not count a retry as repair success without verification failure output", () => {
    const projection = projectRepairIteration({
      originalFailurePreserved: true,
      repairProposalSource: "deterministic-from-failure-evidence",
      confirmationSource: "explicit-authority-contract",
      applyStatus: "single-target-applied",
      postRepairVerificationStatus: "passed",
      sameVerificationCommandRerun: true,
      retryCount: 1,
      maxRepairAttempts: 1,
      changedFiles: ["src/repair.ts"],
      notProvenClaims: ["verification failure output used for retry"],
      finalRepairVerdict: "verified-success-with-repair",
    });

    expect(projection.failureOutputUsedForRetry).toBe(false);
    expect(projection.verdict.status).toBe("NOT_PROVEN");
    expect(projection.verdict.notProvenReasons).toContain(
      "verification failure output not used for retry",
    );
  });
});
