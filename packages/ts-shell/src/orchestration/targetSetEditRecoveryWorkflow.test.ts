import { describe, expect, it } from "vitest";
import { buildTargetSetEditRecoveryWorkflow } from "./targetSetEditRecoveryWorkflow.js";

describe("targetSetEditRecoveryWorkflow", () => {
  it("hands off partial failures to explicit recovery apply without applying rollback", () => {
    const workflow = buildTargetSetEditRecoveryWorkflow({
      transactionId: "target-set-txn-test",
      manifestId: "manifest-test",
      status: "partial-failure",
      fileResults: [
        {
          targetPath: "src/a.ts",
          status: "written",
          recoveryReadiness: "rollback-ready",
          route: {
            snapshotReceipt: {
              snapshotId: "auth:record-a",
            },
          },
        },
        {
          targetPath: "src/b.ts",
          status: "failed",
          recoveryReadiness: "rollback-not-run",
          reason: "Writer failed.",
        },
      ],
    });

    expect(workflow.status).toBe("available");
    expect(workflow.eligibleRollbackTargets).toEqual([
      { targetPath: "src/a.ts", snapshotId: "auth:record-a" },
    ]);
    expect(workflow.requiredConfirmation).toBe("explicit-rollback-apply");
    expect(workflow.automaticRollback).toBe(false);
    expect(workflow.atomicRollback).toBe(false);
    expect(workflow.evidence).toEqual(
      expect.arrayContaining([
        "target-set-edit-recovery-workflow:status:available",
        "target-set-edit-recovery-workflow:explicit-confirmation-required",
        "target-set-edit-recovery-workflow:no-automatic-rollback",
      ]),
    );
  });
});
