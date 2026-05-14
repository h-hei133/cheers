import { describe, expect, it } from "vitest";
import { projectJournalRecoveryPlan } from "./journalRecoveryPlanProjection.js";
import type { RouteScopedEditJournal } from "./routeScopedEditJournal.js";

describe("journal recovery plan projection", () => {
  it("builds a metadata-only plan without recovery or rollback claims", () => {
    const projection = projectJournalRecoveryPlan(
      journal({
        routeId: "route-recovery-plan",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/a.ts",
            planned: true,
            writerStarted: true,
            applied: true,
            verified: true,
            recoveryCandidate: true,
          },
          {
            operationId: "op-2",
            operationKind: "update",
            targetPath: "src/b.ts",
            planned: true,
            writerStarted: true,
            failed: true,
            failureClass: "post-write-verification",
            recoveryCandidate: true,
            unrecovered: true,
          },
        ],
      }),
    );

    expect(projection).toEqual(
      expect.objectContaining({
        source: "route-scoped-edit-journal-recovery-plan",
        mode: "plan-only",
        authority: "metadata-only",
        recoveryExecuted: false,
        rollbackAtomicityClaim: false,
        recoveryCandidateFiles: ["src/a.ts", "src/b.ts"],
        unrecoveredFiles: ["src/b.ts"],
        failedBeforeApplyFiles: [],
        appliedButUnverifiedFiles: ["src/b.ts"],
        appliedAndVerifiedBeforeLaterFailureFiles: ["src/a.ts"],
      }),
    );
    expect(projection.blockers).toEqual([
      "metadata-only-journal",
      "no-durable-snapshot",
      "no-original-content",
      "no-recovery-executor",
      "no-atomicity-authority",
      "no-persistence-authority",
    ]);
    expect(projection.evidence).toEqual(
      expect.arrayContaining([
        "route-scoped-edit-journal-recovery-plan:plan-only",
        "route-scoped-edit-journal-recovery-plan:no-recovery-execution",
        "route-scoped-edit-journal-recovery-plan:no-rollback",
      ]),
    );
  });
});

function journal(input: RouteScopedEditJournal): RouteScopedEditJournal {
  return input;
}
