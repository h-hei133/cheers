import { describe, expect, it } from "vitest";
import { projectJournalRecoveryPlan } from "./plan.js";
import { projectJournalRecoveryReadiness } from "./readiness.js";
import type { RouteScopedEditJournal } from "../model.js";

describe("journal recovery readiness projection", () => {
  it("combines recovery plan facts with absent durable authority diagnostics", () => {
    const inputJournal = journal({
      routeId: "route-readiness",
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
          operationKind: "delete",
          targetPath: "src/b.ts",
          planned: true,
          writerStarted: true,
          failed: true,
          failureClass: "post-write-verification",
          recoveryCandidate: true,
          unrecovered: true,
        },
      ],
    });
    const recoveryPlan = projectJournalRecoveryPlan(inputJournal);

    const readiness = projectJournalRecoveryReadiness({
      journal: inputJournal,
      recoveryPlan,
    });

    expect(readiness).toEqual(
      expect.objectContaining({
        recoveryPlanMode: "plan-only",
        authorityKind: "none",
        authorityAvailability: "absent",
        persistence: "none",
        canRecover: false,
        canRollback: false,
        canRestoreOriginalContent: false,
        requiresDurableAuthority: true,
      }),
    );
    expect(readiness.originalContentRequirements).toEqual([
      expect.objectContaining({
        filePath: "src/a.ts",
        operationKind: "update",
        requiresOriginalContent: true,
      }),
      expect.objectContaining({
        filePath: "src/b.ts",
        operationKind: "delete",
        requiresOriginalContent: true,
      }),
    ]);
    expect(readiness.restoreEligibility.canAttemptRestore).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        "metadata-only-journal",
        "no-durable-snapshot",
        "no-original-content",
        "no-recovery-executor",
        "no-atomicity-authority",
        "no-persistence-authority",
        "no-durable-authority",
        "no-current-content-inspection",
      ]),
    );
    expect(readiness.evidence).toEqual(
      expect.arrayContaining([
        "journal-recovery-readiness:no-file-io",
        "journal-recovery-readiness:no-persistence",
        "journal-recovery-readiness:no-recovery-execution",
        "journal-recovery-readiness:no-rollback",
      ]),
    );
  });
});

function journal(input: RouteScopedEditJournal): RouteScopedEditJournal {
  return input;
}
