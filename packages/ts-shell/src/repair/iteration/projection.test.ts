import { describe, expect, it } from "vitest";

import {
  projectRepairContinuationStrategy,
  projectRepairIteration,
} from "./projection.js";

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
    expect(projection.reviewedApplyEligibility).toBe("eligible");
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

  it("records bounded second repair attempt proof from verification failure output", () => {
    const projection = projectRepairIteration({
      originalFailurePreserved: true,
      repairProposalSource: "deterministic-from-failure-evidence",
      confirmationSource: "explicit-authority-contract",
      applyStatus: "single-target-applied",
      postRepairVerificationStatus: "passed",
      sameVerificationCommandRerun: true,
      retryCount: 2,
      maxRepairAttempts: 2,
      changedFiles: ["src/repair.ts"],
      notProvenClaims: ["live provider repair proposal"],
      finalRepairVerdict: "verified-success-with-repair",
      verificationFailureSummary: "original failed verification",
      attempts: [
        {
          attempt: 1,
          verificationFailureSummary: "original failed verification",
          applyStatus: "single-target-applied",
          postRepairVerificationStatus: "failed",
          sameVerificationCommandRerun: true,
          changedFiles: ["src/repair.ts"],
        },
        {
          attempt: 2,
          verificationFailureSummary: "first repair verification failed",
          applyStatus: "single-target-applied",
          postRepairVerificationStatus: "passed",
          sameVerificationCommandRerun: true,
          changedFiles: ["src/repair.ts"],
        },
      ],
    });

    expect(projection.secondRepairReached).toBe(true);
    expect(projection.failureOutputUsedForRetry).toBe(true);
    expect(projection.attempts.map((attempt) => attempt.failureOutputUsedForRetry)).toEqual([
      true,
      true,
    ]);
    expect(projection.verdict.status).toBe("COMPLETE");
  });

  it("changes repair strategy after repeated failure or missing context", () => {
    expect(projectRepairContinuationStrategy({
      failureOutput: "expected ready status",
      priorAttemptReasons: ["expected ready status"],
      changedFiles: [],
      verificationStatus: "failed",
      contextQuality: "sufficient",
    })).toBe("change-repair-strategy");

    expect(projectRepairContinuationStrategy({
      failureOutput: "missing context for formatter owner",
      priorAttemptReasons: [],
      changedFiles: [],
      verificationStatus: "failed",
      contextQuality: "missing",
    })).toBe("discover-missing-context");

    expect(projectRepairContinuationStrategy({
      failureOutput: "repair changed source",
      priorAttemptReasons: ["original failed check"],
      changedFiles: ["src/repair.ts"],
      verificationStatus: "not-requested",
      contextQuality: "sufficient",
    })).toBe("verify-after-repair");
  });
});
