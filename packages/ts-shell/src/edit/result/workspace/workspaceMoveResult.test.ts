import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "../../../orchestration/patchResult/workspaceAuthority.js";
import { runWorkspaceMoveRoute } from "../../../orchestration/patchResult/workspaceMoveRoute.js";
import { buildWorkspaceMoveRouteResult } from "./workspaceMoveResult.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("workspace move route result projection", () => {
  it("projects a verified move success with target changed and delete/move writer flag", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const patchText = pureMovePatch();

    const route = await runWorkspaceMoveRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: patchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      moveFileExclusive: authority.moveFileExclusive,
    });
    const result = buildWorkspaceMoveRouteResult({
      sessionId: "session-1",
      prompt: patchText,
      route,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.changedFiles).toEqual(["src/to.ts"]);
    expect(result.codingResult?.failedFiles).toEqual([]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        changedFiles: ["src/to.ts"],
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(result.codingResult?.changeSet).toEqual(
      expect.objectContaining({
        postRunDirtyFiles: ["src/to.ts"],
        changedFiles: ["src/to.ts"],
        unchangedAttemptedFiles: [],
      }),
    );
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-move-result:coding-result-success",
        "apply-patch-workspace-move-route:move-writer-invoked",
      ]),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/to.ts": "from\n",
    });
  });

  it("projects an invalid move-like stop without changed files or delete/move writer flags", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const patchText = [
      "*** Begin Patch",
      "*** Update File: src/from.ts",
      "*** Move to: src/to.ts",
      "@@",
      "-from",
      "+to",
      "*** End Patch",
    ].join("\n");

    const route = await runWorkspaceMoveRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: patchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      moveFileExclusive: authority.moveFileExclusive,
    });
    const result = buildWorkspaceMoveRouteResult({
      sessionId: "session-1",
      prompt: patchText,
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.failedFiles).toEqual([
      expect.objectContaining({ path: "(apply_patch)" }),
    ]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "unsupported-no-write",
        failureClass: "unsupported-operation",
        changedFiles: [],
        plannedFiles: [],
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "not-run",
        successLike: false,
      }),
    );
    expect(result.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        operationKind: "move",
        sourcePath: "src/from.ts",
        targetPath: "src/to.ts",
        writeIntent: "none",
      }),
    ]);
    expect(result.codingResult?.changeSet).toEqual(
      expect.objectContaining({
        postRunDirtyFiles: [],
        changedFiles: [],
        unchangedAttemptedFiles: ["(apply_patch)"],
      }),
    );
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-move-result:coding-result-blocked",
        "apply-patch-workspace-move-result:changed-files-empty",
        "apply-patch-workspace-move-result:no-delete-move-invoked",
      ]),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("projects post-write verification failure with changed facts and no success claim", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const patchText = pureMovePatch();

    const route = await runWorkspaceMoveRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: patchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      moveFileExclusive: (sourcePath, targetPath) => {
        fs.copyFileSync(
          path.join(fixture.workspaceRoot, sourcePath),
          path.join(fixture.workspaceRoot, targetPath),
        );
      },
    });
    const result = buildWorkspaceMoveRouteResult({
      sessionId: "session-1",
      prompt: patchText,
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual(["src/to.ts"]);
    expect(result.codingResult?.failedFiles).toEqual([
      expect.objectContaining({ path: "(apply_patch)" }),
    ]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "post-write-verification",
        changedFiles: ["src/to.ts"],
        plannedFiles: [],
        failedFiles: [
          expect.objectContaining({ path: "src/to.ts" }),
        ],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: true,
        postWriteVerification: "failed",
        successLike: false,
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        routeId: "single-file-apply-patch-workspace-move",
        operationKinds: ["move"],
        plannedFiles: ["src/to.ts"],
        changedFiles: ["src/to.ts"],
        verifiedFiles: ["src/to.ts"],
        failedFiles: [
          expect.objectContaining({
            path: "src/to.ts",
            failureClass: "post-write-verification",
          }),
        ],
        unrecoveredFiles: ["src/to.ts"],
        recoveryCandidateFiles: ["src/to.ts"],
        writerStarted: true,
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
        recoveryCandidateFiles: ["src/to.ts"],
        unrecoveredFiles: ["src/to.ts"],
        failedBeforeApplyFiles: [],
        appliedButUnverifiedFiles: ["src/to.ts"],
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal
        ?.recoveryPlan.originalContentAuthority.requirements,
    ).toEqual([
      expect.objectContaining({
        filePath: "src/to.ts",
        operationKind: "move",
        requiresOriginalContent: true,
        requiresCurrentContentCheck: true,
        requiresWorkspaceAuthority: true,
        requiresPersistence: true,
      }),
    ]);
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal
        ?.recoveryPlan.recoveryReadiness,
    ).toEqual(
      expect.objectContaining({
        authorityKind: "none",
        authorityAvailability: "absent",
        persistence: "none",
        canRecover: false,
        canRollback: false,
        canRestoreOriginalContent: false,
      }),
    );
    expect(result.codingResult?.changeSet).toEqual(
      expect.objectContaining({
        postRunDirtyFiles: ["src/to.ts"],
        changedFiles: ["src/to.ts"],
        attemptedFiles: ["src/to.ts"],
        unchangedAttemptedFiles: [],
      }),
    );
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-move-result:coding-result-blocked",
        "apply-patch-workspace-move-result:changed-files-preserved-after-writer",
        "apply-patch-workspace-move-result:delete-move-invoked-no-success-claim",
        "apply-patch-workspace-move-route:no-rollback",
      ]),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/from.ts": "from\n",
      "src/to.ts": "from\n",
    });
  });
});

function pureMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    " from",
    "*** End Patch",
  ].join("\n");
}

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-workspace-move-result-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "from.ts"), "from\n", "utf8");
  return { workspaceRoot };
}

function snapshotFixture(workspaceRoot: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      result[path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/")] =
        fs.readFileSync(absolutePath, "utf8");
    }
  };
  visit(workspaceRoot);
  return result;
}
