import { describe, expect, it } from "vitest";
import {
  buildTargetSetEditTransaction,
  buildTargetSetEditTransactionId,
} from "./targetSetEditTransaction.js";

describe("targetSetEditTransaction", () => {
  it("builds stable safe transaction facts for recovery-available partial failure", () => {
    const transactionId = buildTargetSetEditTransactionId({
      manifestId: "manifest-test",
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
    });
    const transaction = buildTargetSetEditTransaction({
      transactionId,
      manifestId: "manifest-test",
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
      policy: {
        status: "passed",
        mutationAllowed: true,
        maxFileGuard: "within-limit",
        atomicity: "all-target-preflight-before-first-mutation",
        writeAtomicityClaim: false,
        evidence: ["target-set-edit-policy:preflight-passed"],
      },
      changedFileCount: 1,
      failedFileCount: 1,
      verification: {
        overallStatus: "failed",
        hardFailure: true,
        warning: true,
        passedFiles: ["src/a.ts"],
        failedFiles: ["src/b.ts"],
        skippedFiles: [],
        perFile: [],
        recoveryRecommendation: "Use explicit recovery apply.",
        evidence: ["target-set-edit-verification:overall:failed"],
      },
      recovery: {
        status: "available",
        eligibleRollbackTargets: [{ targetPath: "src/a.ts" }],
        ineligibleRollbackTargets: [{ targetPath: "src/b.ts" }],
        requiredConfirmation: "explicit-rollback-apply",
        recoveryPlanId: "target-set-recovery-test",
        safeSnapshotIds: ["auth:record-a"],
        recommendation: "Use explicit recovery apply.",
        doNext: "Confirm snapshot ids.",
        automaticRollback: false,
        atomicRollback: false,
        evidence: ["target-set-edit-recovery-workflow:status:available"],
      },
      journal: [],
    });

    expect(transaction.transactionId).toBe(transactionId);
    expect(transaction.outcome).toBe("recovery-available");
    expect(transaction.executionStatus).toBe("partial-failure");
    expect(transaction.evidence).toEqual(
      expect.arrayContaining([
        `target-set-edit-transaction:id:${transactionId}`,
        "target-set-edit-transaction:no-atomic-rollback",
        "target-set-edit-transaction:raw-content-excluded",
      ]),
    );
    expect(JSON.stringify(transaction)).not.toContain("status: draft");
  });
});
