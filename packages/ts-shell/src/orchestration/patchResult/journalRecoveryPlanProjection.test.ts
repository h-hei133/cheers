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

  it("reflects explicit non-default captured authority without automatic recovery or rollback", () => {
    const projection = projectJournalRecoveryPlan(
      journal({
        routeId: "route-captured-authority",
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
        ],
      }),
      {
        originalContentAuthorityRecords: [
          {
            filePath: "src/a.ts",
            operationKind: "update",
            beforeContentHash: "before-hash",
            beforeContentAvailable: true,
            expectedCurrentState: "exists",
            expectedCurrentContentHash: "after-hash",
            capturedAtPhase: "pre-write",
            persistence: "non-default",
          },
        ],
      },
    );

    expect(projection.recoveryExecuted).toBe(false);
    expect(projection.rollbackAtomicityClaim).toBe(false);
    expect(projection.durableAuthority).toEqual(
      expect.objectContaining({
        authorityKind: "original-content-ledger",
        availability: "available",
        persistence: "non-default",
        canRecover: false,
        canRollback: false,
        canRestoreOriginalContent: true,
        canVerifyCurrentContent: true,
      }),
    );
    expect(projection.originalContentAuthority.status).toBe(
      "content-authority-present",
    );
    expect(
      projection.originalContentAuthority.restoreEligibility
        .canAttemptExplicitRestore,
    ).toBe(true);
    expect(
      projection.originalContentAuthority.restoreEligibility
        .canRecoverAutomatically,
    ).toBe(false);
    expect(
      projection.originalContentAuthority.restoreEligibility
        .canRollbackAtomically,
    ).toBe(false);
    expect(projection.recoveryReadiness.canAttemptExplicitRestore).toBe(true);
    expect(projection.recoveryReadiness.canRecoverAutomatically).toBe(false);
    expect(projection.recoveryReadiness.canRollbackAtomically).toBe(false);
  });
});

function journal(input: RouteScopedEditJournal): RouteScopedEditJournal {
  return input;
}
