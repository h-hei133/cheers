import { describe, expect, it } from "vitest";
import { projectJournalFailureState } from "./journalFailureStateProjection.js";
import type { RouteScopedEditJournal } from "../../../orchestration/patchResult/routeScopedEditJournal.js";

describe("journal failure state projection", () => {
  it("classifies preflight and writer failures as failed before apply", () => {
    const projection = projectJournalFailureState(
      journal({
        routeId: "route-pre-apply",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/a.ts",
            planned: true,
            failed: true,
            failureClass: "preflight",
          },
          {
            operationId: "op-2",
            operationKind: "create",
            targetPath: "src/b.ts",
            planned: true,
            writerStarted: true,
            failed: true,
            failureClass: "write-application",
          },
        ],
      }),
    );

    expect(projection.failedBeforeApplyFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(projection.appliedButUnverifiedFiles).toEqual([]);
    expect(projection.unknownApplicationStateFiles).toEqual([]);
  });

  it("classifies post-write verification failure as applied but unverified", () => {
    const projection = projectJournalFailureState(
      journal({
        routeId: "route-post-write",
        operations: [
          {
            operationId: "op-1",
            operationKind: "update",
            targetPath: "src/app.ts",
            planned: true,
            writerStarted: true,
            failed: true,
            failureClass: "post-write-verification",
          },
        ],
      }),
    );

    expect(projection.failedBeforeApplyFiles).toEqual([]);
    expect(projection.appliedButUnverifiedFiles).toEqual(["src/app.ts"]);
  });

  it("classifies verified changed prefix before a later failure", () => {
    const projection = projectJournalFailureState(
      journal({
        routeId: "route-prefix",
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
            operationKind: "update",
            targetPath: "src/b.ts",
            planned: true,
            writerStarted: true,
            failed: true,
            failureClass: "write-application",
          },
        ],
      }),
    );

    expect(projection.appliedAndVerifiedBeforeLaterFailureFiles).toEqual([
      "src/a.ts",
    ]);
    expect(projection.failedBeforeApplyFiles).toEqual(["src/b.ts"]);
  });

  it("uses unknown state when failed applied facts are insufficient", () => {
    const projection = projectJournalFailureState(
      journal({
        routeId: "route-unknown",
        operations: [
          {
            operationId: "op-1",
            operationKind: "delete",
            targetPath: "src/remove.ts",
            planned: true,
            writerStarted: true,
            applied: true,
            failed: true,
            failureClass: "recovery-failed",
          },
        ],
      }),
    );

    expect(projection.unknownApplicationStateFiles).toEqual(["src/remove.ts"]);
    expect(projection.failedBeforeApplyFiles).toEqual([]);
  });
});

function journal(input: RouteScopedEditJournal): RouteScopedEditJournal {
  return input;
}
