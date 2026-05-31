import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMixedFileWriteRouteResult } from "./mixedFileWriteResult.js";
import { runMixedFileWriteRoute } from "../../../orchestration/patchResult/mixedFileWriteRoute.js";
import { createWorkspaceWriteAuthority } from "../../authority/workspace.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("mixed file write result journal metadata", () => {
  it("attaches journal metadata to partial failure without changing result fields", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const route = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, updateCreatePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: () => {
        throw new Error("simulated create failure");
      },
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: authority.deleteFile,
    });

    const result = buildMixedFileWriteRouteResult({
      sessionId: "session-1",
      prompt: updateCreatePatch(),
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.verifiedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.failedFiles).toEqual([
      {
        path: "src/new.ts",
        reason: expect.stringContaining("Patch mixed write failed"),
      },
    ]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        failureClass: "partial-failure",
        changedFiles: ["src/a.ts"],
        failedFiles: [
          {
            path: "src/new.ts",
            reason: expect.stringContaining("Patch mixed write failed"),
          },
        ],
        writerInvoked: true,
        creatorInvoked: true,
        deleteMoveInvoked: false,
        postWriteVerification: "blocked",
        successLike: false,
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        source: "route-scoped-edit-journal",
        routeId: "mixed-file-apply-patch-workspace-write",
        changedFiles: ["src/a.ts"],
        verifiedFiles: ["src/a.ts"],
        failedFiles: [
          {
            path: "src/new.ts",
            reason: expect.stringContaining("Patch mixed write failed"),
            failureClass: "write-application",
          },
        ],
        recoveryCandidateFiles: ["src/a.ts"],
        unrecoveredFiles: [],
        rollbackAtomicityClaim: false,
        recoveryExecuted: false,
        writeCapability: "metadata-only",
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal
        ?.recoveryPlan,
    ).toEqual(
      expect.objectContaining({
        mode: "plan-only",
        authority: "metadata-only",
        recoveryExecuted: false,
        rollbackAtomicityClaim: false,
        recoveryCandidateFiles: ["src/a.ts"],
        unrecoveredFiles: [],
        failedBeforeApplyFiles: ["src/new.ts"],
        appliedButUnverifiedFiles: [],
        appliedAndVerifiedBeforeLaterFailureFiles: ["src/a.ts"],
        blockers: expect.arrayContaining([
          "metadata-only-journal",
          "no-durable-snapshot",
          "no-original-content",
          "no-recovery-executor",
          "no-atomicity-authority",
        ]),
      }),
    );
    const recoveryPlan =
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal
        ?.recoveryPlan;
    expect(recoveryPlan?.durableAuthority).toEqual(
      expect.objectContaining({
        authorityKind: "none",
        availability: "absent",
        persistence: "none",
        canRecover: false,
        canRollback: false,
        canRestoreOriginalContent: false,
        canVerifyCurrentContent: false,
      }),
    );
    expect(recoveryPlan?.originalContentAuthority.requirements).toEqual([
      expect.objectContaining({
        filePath: "src/a.ts",
        operationKind: "update",
        requiresOriginalContent: true,
      }),
      expect.objectContaining({
        filePath: "src/new.ts",
        operationKind: "create",
        requiresOriginalContent: false,
      }),
    ]);
    expect(recoveryPlan?.recoveryReadiness).toEqual(
      expect.objectContaining({
        authorityKind: "none",
        authorityAvailability: "absent",
        persistence: "none",
        canRecover: false,
        canRollback: false,
        canRestoreOriginalContent: false,
        requiresDurableAuthority: true,
      }),
    );
    expect(
      recoveryPlan?.recoveryReadiness.restoreEligibility.canAttemptRestore,
    ).toBe(false);
  });

  it("projects exactly-three mixed partial failure with planned files and plan-only recovery metadata", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const route = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, updateCreateDeletePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: () => {
        throw new Error("simulated delete failure");
      },
    });

    const result = buildMixedFileWriteRouteResult({
      sessionId: "session-1",
      prompt: updateCreateDeletePatch(),
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.codingResult?.changedFiles).toEqual([
      "src/a.ts",
      "src/new.ts",
    ]);
    expect(result.codingResult?.failedFiles).toEqual([
      {
        path: "src/remove.ts",
        reason: expect.stringContaining("Patch mixed write failed"),
      },
    ]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        failureClass: "partial-failure",
        writeIntentFiles: ["src/a.ts", "src/new.ts", "src/remove.ts"],
        plannedFiles: [],
        changedFiles: ["src/a.ts", "src/new.ts"],
        failedFiles: [
          {
            path: "src/remove.ts",
            reason: expect.stringContaining("Patch mixed write failed"),
          },
        ],
        writerInvoked: true,
        creatorInvoked: true,
        deleteMoveInvoked: true,
        postWriteVerification: "blocked",
        successLike: false,
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        operationCount: 3,
        plannedFiles: ["src/a.ts", "src/new.ts", "src/remove.ts"],
        changedFiles: ["src/a.ts", "src/new.ts"],
        failedFiles: [
          expect.objectContaining({
            path: "src/remove.ts",
            failureClass: "write-application",
          }),
        ],
        recoveryCandidateFiles: ["src/a.ts", "src/new.ts"],
        rollbackAtomicityClaim: false,
        recoveryExecuted: false,
        writeCapability: "metadata-only",
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal
        ?.recoveryPlan,
    ).toEqual(
      expect.objectContaining({
        mode: "plan-only",
        authority: "metadata-only",
        recoveryExecuted: false,
        rollbackAtomicityClaim: false,
        recoveryCandidateFiles: ["src/a.ts", "src/new.ts"],
        failedBeforeApplyFiles: ["src/remove.ts"],
        appliedAndVerifiedBeforeLaterFailureFiles: [
          "src/a.ts",
          "src/new.ts",
        ],
      }),
    );
  });

  it("projects exactly-four mixed partial failure with all planned files and plan-only recovery metadata", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const route = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, updateCreateDeleteMovePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: () => {
        throw new Error("simulated move failure");
      },
      deleteFile: authority.deleteFile,
    });

    const result = buildMixedFileWriteRouteResult({
      sessionId: "session-1",
      prompt: updateCreateDeleteMovePatch(),
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.codingResult?.changedFiles).toEqual([
      "src/a.ts",
      "src/new.ts",
      "src/remove.ts",
    ]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        failureClass: "partial-failure",
        writeIntentFiles: [
          "src/a.ts",
          "src/new.ts",
          "src/remove.ts",
          "src/to.ts",
        ],
        changedFiles: ["src/a.ts", "src/new.ts", "src/remove.ts"],
        failedFiles: [
          {
            path: "src/to.ts",
            reason: expect.stringContaining("Patch mixed write failed"),
          },
        ],
        writerInvoked: true,
        creatorInvoked: true,
        deleteMoveInvoked: true,
        postWriteVerification: "blocked",
        successLike: false,
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        operationCount: 4,
        plannedFiles: ["src/a.ts", "src/new.ts", "src/remove.ts", "src/to.ts"],
        changedFiles: ["src/a.ts", "src/new.ts", "src/remove.ts"],
        failedFiles: [
          expect.objectContaining({
            path: "src/to.ts",
            failureClass: "write-application",
          }),
        ],
        recoveryCandidateFiles: ["src/a.ts", "src/new.ts", "src/remove.ts"],
        rollbackAtomicityClaim: false,
        recoveryExecuted: false,
        writeCapability: "metadata-only",
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal
        ?.recoveryPlan,
    ).toEqual(
      expect.objectContaining({
        mode: "plan-only",
        authority: "metadata-only",
        recoveryExecuted: false,
        rollbackAtomicityClaim: false,
        recoveryCandidateFiles: ["src/a.ts", "src/new.ts", "src/remove.ts"],
        failedBeforeApplyFiles: ["src/to.ts"],
        appliedButUnverifiedFiles: [],
        appliedAndVerifiedBeforeLaterFailureFiles: [
          "src/a.ts",
          "src/new.ts",
          "src/remove.ts",
        ],
      }),
    );
  });
});

function routeOptions(workspaceRoot: string, rawPatchText: string) {
  return {
    workspaceRoot,
    rawPatchText,
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: "approved" as const,
    defaultProductionRejectionUnchanged: true as const,
  };
}

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "mixed-file-write-result-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "a = 1\n", "utf8");
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "remove.ts"),
    "remove\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "from.ts"),
    "from\n",
    "utf8",
  );
  return { workspaceRoot };
}

function updateCreatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Add File: src/new.ts",
    "+created",
    "*** End Patch",
  ].join("\n");
}

function updateCreateDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Add File: src/new.ts",
    "+created",
    "*** Delete File: src/remove.ts",
    "*** End Patch",
  ].join("\n");
}

function updateCreateDeleteMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Add File: src/new.ts",
    "+created",
    "*** Delete File: src/remove.ts",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    " from",
    "*** End Patch",
  ].join("\n");
}
