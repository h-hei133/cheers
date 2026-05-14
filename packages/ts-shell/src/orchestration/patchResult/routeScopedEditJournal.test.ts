import { describe, expect, it } from "vitest";
import {
  projectRouteScopedEditJournal,
  type RouteScopedEditJournalOperation,
} from "./routeScopedEditJournal.js";

describe("route-scoped edit journal projection", () => {
  it("keeps an empty journal free of changed, failed, and recovery state", () => {
    const projection = projectRouteScopedEditJournal({
      routeId: "route-empty",
      operations: [],
    });

    expect(projection.operationCount).toBe(0);
    expect(projection.changedFiles).toEqual([]);
    expect(projection.failedFiles).toEqual([]);
    expect(projection.verifiedFiles).toEqual([]);
    expect(projection.unrecoveredFiles).toEqual([]);
    expect(projection.recoveryCandidateFiles).toEqual([]);
    expect(projection.writerStarted).toBe(false);
    expect(projection.hasPartialApply).toBe(false);
    expect(projection.hasUnrecoveredApply).toBe(false);
    expect(projection.rollbackAtomicityClaim).toBe(false);
    expect(projection.writeCapability).toBe("metadata-only");
  });

  it("does not count planned operations as changed files", () => {
    const projection = projectRouteScopedEditJournal({
      routeId: "route-planned",
      operations: [
        operation({
          operationId: "op-1",
          operationKind: "update",
          targetPath: "src/app.ts",
          planned: true,
        }),
      ],
    });

    expect(projection.plannedFiles).toEqual(["src/app.ts"]);
    expect(projection.changedFiles).toEqual([]);
    expect(projection.failedFiles).toEqual([]);
    expect(projection.writerStarted).toBe(false);
  });

  it("counts an applied and verified operation as changed and verified", () => {
    const projection = projectRouteScopedEditJournal({
      routeId: "route-verified",
      operations: [
        operation({
          operationId: "op-1",
          operationKind: "update",
          targetPath: "src/app.ts",
          planned: true,
          preflightPassed: true,
          writerStarted: true,
          applied: true,
          verified: true,
        }),
      ],
    });

    expect(projection.changedFiles).toEqual(["src/app.ts"]);
    expect(projection.verifiedFiles).toEqual(["src/app.ts"]);
    expect(projection.failedFiles).toEqual([]);
    expect(projection.writerStarted).toBe(true);
    expect(projection.hasPartialApply).toBe(false);
  });

  it("counts failed verification after apply as changed, failed, and unrecovered", () => {
    const projection = projectRouteScopedEditJournal({
      routeId: "route-verification-failed",
      operations: [
        operation({
          operationId: "op-1",
          operationKind: "update",
          targetPath: "src/app.ts",
          planned: true,
          preflightPassed: true,
          writerStarted: true,
          applied: true,
          failed: true,
          failureClass: "post-write-verification",
          failureReason: "readback mismatch",
        }),
      ],
    });

    expect(projection.changedFiles).toEqual(["src/app.ts"]);
    expect(projection.failedFiles).toEqual([
      {
        path: "src/app.ts",
        reason: "readback mismatch",
        failureClass: "post-write-verification",
      },
    ]);
    expect(projection.unrecoveredFiles).toEqual(["src/app.ts"]);
    expect(projection.hasPartialApply).toBe(true);
    expect(projection.hasUnrecoveredApply).toBe(true);
  });

  it("counts writer failure before apply as failed but not changed", () => {
    const projection = projectRouteScopedEditJournal({
      routeId: "route-writer-failed",
      operations: [
        operation({
          operationId: "op-1",
          operationKind: "update",
          targetPath: "src/app.ts",
          planned: true,
          preflightPassed: true,
          writerStarted: true,
          failed: true,
          failureClass: "write-application",
        }),
      ],
    });

    expect(projection.changedFiles).toEqual([]);
    expect(projection.failedFiles).toEqual([
      {
        path: "src/app.ts",
        reason: "writer failed before a verified apply",
        failureClass: "write-application",
      },
    ]);
    expect(projection.unrecoveredFiles).toEqual([]);
    expect(projection.hasPartialApply).toBe(false);
  });

  it("represents a mixed operation sequence with a verified prefix and failed suffix", () => {
    const projection = projectRouteScopedEditJournal({
      routeId: "route-mixed-prefix",
      operations: [
        operation({
          operationId: "op-1",
          operationKind: "update",
          targetPath: "src/a.ts",
          planned: true,
          preflightPassed: true,
          writerStarted: true,
          applied: true,
          verified: true,
        }),
        operation({
          operationId: "op-2",
          operationKind: "create",
          targetPath: "src/b.ts",
          planned: true,
          preflightPassed: true,
          writerStarted: true,
          applied: true,
          failed: true,
          failureClass: "post-write-verification",
        }),
      ],
    });

    expect(projection.operationKinds).toEqual(["update", "create"]);
    expect(projection.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(projection.verifiedFiles).toEqual(["src/a.ts"]);
    expect(projection.failedFiles.map((failure) => failure.path)).toEqual([
      "src/b.ts",
    ]);
    expect(projection.unrecoveredFiles).toEqual(["src/b.ts"]);
    expect(projection.hasPartialApply).toBe(true);
  });

  it("treats recovery candidate as metadata only without implying rollback happened", () => {
    const projection = projectRouteScopedEditJournal({
      routeId: "route-recovery-candidate",
      operations: [
        operation({
          operationId: "op-1",
          operationKind: "delete",
          targetPath: "src/remove.ts",
          planned: true,
          recoveryCandidate: true,
          failed: true,
          failureClass: "recovery-unavailable",
        }),
      ],
    });

    expect(projection.recoveryCandidateFiles).toEqual(["src/remove.ts"]);
    expect(projection.recoveredFiles).toEqual([]);
    expect(projection.changedFiles).toEqual([]);
    expect(projection.writeCapability).toBe("metadata-only");
    expect(projection.evidence).toEqual(
      expect.arrayContaining([
        "route-scoped-edit-journal:metadata-only",
        "route-scoped-edit-journal:no-runtime-writer",
      ]),
    );
  });

  it("never produces a rollback or atomicity claim", () => {
    const projection = projectRouteScopedEditJournal({
      routeId: "route-no-atomicity",
      operations: [
        operation({
          operationId: "op-1",
          operationKind: "update",
          targetPath: "src/app.ts",
          planned: true,
          writerStarted: true,
          applied: true,
          verified: true,
          recovered: true,
        }),
      ],
    });

    expect(projection.rollbackAtomicityClaim).toBe(false);
    expect(projection.evidence).toContain(
      "route-scoped-edit-journal:no-rollback-atomicity-claim",
    );
  });

  it("represents delete, move, update, and create operation kinds", () => {
    const projection = projectRouteScopedEditJournal({
      routeId: "route-all-kinds",
      operations: [
        operation({
          operationId: "op-1",
          operationKind: "delete",
          targetPath: "src/remove.ts",
          planned: true,
        }),
        operation({
          operationId: "op-2",
          operationKind: "move",
          sourcePath: "src/from.ts",
          targetPath: "src/to.ts",
          planned: true,
        }),
        operation({
          operationId: "op-3",
          operationKind: "update",
          targetPath: "src/app.ts",
          planned: true,
        }),
        operation({
          operationId: "op-4",
          operationKind: "create",
          targetPath: "src/new.ts",
          planned: true,
        }),
      ],
    });

    expect(projection.operationKinds).toEqual([
      "delete",
      "move",
      "update",
      "create",
    ]);
    expect(projection.plannedFiles).toEqual([
      "src/remove.ts",
      "src/to.ts",
      "src/app.ts",
      "src/new.ts",
    ]);
  });

  it("represents 3+ operations as journal metadata without enabling writes", () => {
    const projection = projectRouteScopedEditJournal({
      routeId: "route-three-plus",
      operations: [
        operation({
          operationId: "op-1",
          operationKind: "update",
          targetPath: "src/a.ts",
          planned: true,
        }),
        operation({
          operationId: "op-2",
          operationKind: "create",
          targetPath: "src/b.ts",
          planned: true,
        }),
        operation({
          operationId: "op-3",
          operationKind: "move",
          sourcePath: "src/c.ts",
          targetPath: "src/d.ts",
          planned: true,
        }),
      ],
    });

    expect(projection.operationCount).toBe(3);
    expect(projection.plannedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/d.ts",
    ]);
    expect(projection.changedFiles).toEqual([]);
    expect(projection.writerStarted).toBe(false);
    expect(projection.writeCapability).toBe("metadata-only");
    expect(projection.rollbackAtomicityClaim).toBe(false);
  });
});

function operation(
  input: RouteScopedEditJournalOperation,
): RouteScopedEditJournalOperation {
  return input;
}
