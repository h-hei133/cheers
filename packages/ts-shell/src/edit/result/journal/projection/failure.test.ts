import { describe, expect, it } from "vitest";
import { projectJournalFailureSurface } from "./failure.js";
import {
  buildPerFilePatchPlan,
  projectPerFilePatchResult,
} from "../../../patch/plan/perFile.js";
import type { RouteScopedEditJournal } from "../model.js";

describe("journal failure result projection", () => {
  it("projects planned-only journal without changed files", () => {
    const projection = projectJournalFailureSurface(
      journal({
        routeId: "route-planned",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/app.ts",
            planned: true,
          },
        ],
      }),
    );

    expect(projection.plannedFiles).toEqual(["src/app.ts"]);
    expect(projection.changedFiles).toEqual([]);
    expect(projection.failedFiles).toEqual([]);
    expect(projection.writerStarted).toBe(false);
    expect(projection.writeCapability).toBe("metadata-only");
  });

  it("projects verified operation as changed and verified", () => {
    const projection = projectJournalFailureSurface(
      journal({
        routeId: "route-verified",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/app.ts",
            planned: true,
            writerStarted: true,
            applied: true,
            verified: true,
          },
        ],
      }),
    );

    expect(projection.changedFiles).toEqual(["src/app.ts"]);
    expect(projection.verifiedFiles).toEqual(["src/app.ts"]);
    expect(projection.failedFiles).toEqual([]);
    expect(projection.writerStarted).toBe(true);
  });

  it("projects writer failure before apply as failed without changed files", () => {
    const projection = projectJournalFailureSurface(
      journal({
        routeId: "route-writer-failed",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/app.ts",
            planned: true,
            writerStarted: true,
            failed: true,
            failureClass: "write-application",
          },
        ],
      }),
    );

    expect(projection.changedFiles).toEqual([]);
    expect(projection.failedFiles).toEqual([
      {
        path: "src/app.ts",
        reason: "writer failed before a verified apply",
        failureClass: "write-application",
      },
    ]);
    expect(projection.unrecoveredFiles).toEqual([]);
  });

  it("projects post-write verification failure as changed, failed, and unrecovered", () => {
    const projection = projectJournalFailureSurface(
      journal({
        routeId: "route-verification-failed",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/app.ts",
            planned: true,
            writerStarted: true,
            applied: true,
            failed: true,
            failureClass: "post-write-verification",
            failureReason: "readback mismatch",
          },
        ],
      }),
    );

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

  it("keeps mixed prefix success and suffix failure distinct", () => {
    const projection = projectJournalFailureSurface(
      journal({
        routeId: "route-mixed",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/a.ts",
            planned: true,
            writerStarted: true,
            applied: true,
            verified: true,
          },
          {
            operationId: "op-2",
            operationKind: "create",
            targetPath: "src/b.ts",
            planned: true,
            writerStarted: true,
            applied: true,
            failed: true,
            failureClass: "post-write-verification",
          },
        ],
      }),
    );

    expect(projection.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(projection.verifiedFiles).toEqual(["src/a.ts"]);
    expect(projection.failedFiles.map((failure) => failure.path)).toEqual([
      "src/b.ts",
    ]);
    expect(projection.unrecoveredFiles).toEqual(["src/b.ts"]);
  });

  it("does not treat recovery candidates as executed recovery", () => {
    const projection = projectJournalFailureSurface(
      journal({
        routeId: "route-recovery-candidate",
        operations: [
          {
            operationId: "op-1",
            operationKind: "delete",
            targetPath: "src/remove.ts",
            planned: true,
            recoveryCandidate: true,
            failed: true,
            failureClass: "recovery-unavailable",
          },
        ],
      }),
    );

    expect(projection.recoveryCandidateFiles).toEqual(["src/remove.ts"]);
    expect(projection.recoveryExecuted).toBe(false);
    expect(projection.evidence).toContain(
      "route-scoped-edit-journal-result:recovery-not-executed",
    );
  });

  it("keeps rollback atomicity claim false", () => {
    const projection = projectJournalFailureSurface(
      journal({
        routeId: "route-no-rollback",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/app.ts",
            planned: true,
            writerStarted: true,
            applied: true,
            verified: true,
          },
        ],
      }),
    );

    expect(projection.rollbackAtomicityClaim).toBe(false);
    expect(projection.evidence).toContain(
      "route-scoped-edit-journal:no-rollback-atomicity-claim",
    );
  });

  it("attaches to a stopped no-write result without changing success semantics", () => {
    const plan = buildPerFilePatchPlan({
      workspaceRoot: "/workspace",
      rawPatchText: [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ].join("\n"),
      readFile: () => "old\n",
    });

    const result = projectPerFilePatchResult({
      plan,
      routeScopedEditJournal: journal({
        routeId: "route-stopped",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/app.ts",
            planned: true,
          },
        ],
      }),
      failedFiles: [
        {
          path: "src/app.ts",
          reason: "stopped before writer start",
        },
      ],
      writerInvoked: false,
      creatorInvoked: false,
      deleteMoveInvoked: false,
      postWriteVerification: "not-run",
    });

    expect(result.successLike).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles).toEqual([
      {
        path: "src/app.ts",
        reason: "stopped before writer start",
      },
    ]);
    expect(result.writerInvoked).toBe(false);
    expect(result.creatorInvoked).toBe(false);
    expect(result.deleteMoveInvoked).toBe(false);
    expect(result.postWriteVerification).toBe("not-run");
    expect(result.routeScopedEditJournal).toEqual(
      expect.objectContaining({
        source: "route-scoped-edit-journal",
        routeId: "route-stopped",
        plannedFiles: ["src/app.ts"],
        changedFiles: [],
        recoveryExecuted: false,
        rollbackAtomicityClaim: false,
        writeCapability: "metadata-only",
      }),
    );
    expect(result.evidence).toContain(
      "per-file-patch-result:route-scoped-journal-attached",
    );
  });

  it("attaches to an unsupported no-write result without enabling writer flags", () => {
    const plan = buildPerFilePatchPlan({
      workspaceRoot: "/workspace",
      rawPatchText: [
        "*** Begin Patch",
        "*** Delete File: src/missing.ts",
        "*** End Patch",
      ].join("\n"),
      readFile: () => undefined,
    });

    const result = projectPerFilePatchResult({
      plan,
      routeScopedEditJournal: journal({
        routeId: "route-unsupported",
        operations: [
          {
            operationId: "op-1",
            operationKind: "delete",
            targetPath: "src/missing.ts",
            planned: true,
            failed: true,
            failureClass: "preflight",
          },
        ],
      }),
    });

    expect(result.supportStatus).toBe("unsupported-no-write");
    expect(result.successLike).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(result.writerInvoked).toBe(false);
    expect(result.creatorInvoked).toBe(false);
    expect(result.deleteMoveInvoked).toBe(false);
    expect(result.postWriteVerification).toBe("not-run");
    expect(result.routeScopedEditJournal).toEqual(
      expect.objectContaining({
        routeId: "route-unsupported",
        changedFiles: [],
        failedFiles: [
          {
            path: "src/missing.ts",
            reason: "operation preflight failed before writer start",
            failureClass: "preflight",
          },
        ],
        recoveryExecuted: false,
        rollbackAtomicityClaim: false,
      }),
    );
  });
});

function journal(input: RouteScopedEditJournal): RouteScopedEditJournal {
  return input;
}
