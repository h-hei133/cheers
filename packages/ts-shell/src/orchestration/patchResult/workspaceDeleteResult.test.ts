import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { runWorkspaceDeleteRoute } from "./workspaceDeleteRoute.js";
import { buildWorkspaceDeleteRouteResult } from "./workspaceDeleteResult.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("workspace delete route result projection", () => {
  it("projects a verified delete success with target changed and delete/move writer flag", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const patchText = deletePatch();

    const route = await runWorkspaceDeleteRoute({
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
      deleteFile: authority.deleteFile,
    });
    const result = buildWorkspaceDeleteRouteResult({
      sessionId: "session-1",
      prompt: patchText,
      route,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.changedFiles).toEqual(["src/delete-me.ts"]);
    expect(result.codingResult?.failedFiles).toEqual([]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        changedFiles: ["src/delete-me.ts"],
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
        postRunDirtyFiles: ["src/delete-me.ts"],
        changedFiles: ["src/delete-me.ts"],
        unchangedAttemptedFiles: [],
      }),
    );
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-delete-result:coding-result-success",
        "apply-patch-workspace-delete-route:delete-writer-invoked",
      ]),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/other.ts": "other\n",
    });
  });

  it("projects an invalid delete-like stop without changed files or delete/move writer flags", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const patchText = [
      "*** Begin Patch",
      "*** Delete File: src/missing.ts",
      "*** End Patch",
    ].join("\n");

    const route = await runWorkspaceDeleteRoute({
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
      deleteFile: authority.deleteFile,
    });
    const result = buildWorkspaceDeleteRouteResult({
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
        failureClass: "missing-target",
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
        operationKind: "delete",
        targetPath: "src/missing.ts",
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
        "apply-patch-workspace-delete-result:coding-result-blocked",
        "apply-patch-workspace-delete-result:changed-files-empty",
        "apply-patch-workspace-delete-result:no-delete-move-invoked",
      ]),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("projects post-delete verification failure with failed facts and no success claim", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const patchText = deletePatch();

    const route = await runWorkspaceDeleteRoute({
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
      deleteFile: () => {
        // Simulates an unlink call that returned but did not remove the target.
      },
    });
    const result = buildWorkspaceDeleteRouteResult({
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
        supportStatus: "supported-write",
        failureClass: "post-write-verification",
        changedFiles: [],
        plannedFiles: [],
        failedFiles: [
          expect.objectContaining({ path: "src/delete-me.ts" }),
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
        routeId: "single-file-apply-patch-workspace-delete",
        operationKinds: ["delete"],
        plannedFiles: ["src/delete-me.ts"],
        changedFiles: [],
        failedFiles: [
          expect.objectContaining({
            path: "src/delete-me.ts",
            failureClass: "post-write-verification",
          }),
        ],
        unrecoveredFiles: ["src/delete-me.ts"],
        recoveryCandidateFiles: ["src/delete-me.ts"],
        writerStarted: true,
        rollbackAtomicityClaim: false,
        recoveryExecuted: false,
        writeCapability: "metadata-only",
      }),
    );
    expect(result.codingResult?.changeSet).toEqual(
      expect.objectContaining({
        postRunDirtyFiles: [],
        changedFiles: [],
        attemptedFiles: ["src/delete-me.ts"],
        unchangedAttemptedFiles: ["src/delete-me.ts"],
      }),
    );
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-delete-result:coding-result-blocked",
        "apply-patch-workspace-delete-result:changed-files-empty",
        "apply-patch-workspace-delete-result:delete-move-invoked-no-success-claim",
        "apply-patch-workspace-delete-route:no-rollback",
      ]),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/delete-me.ts": "delete\n",
      "src/other.ts": "other\n",
    });
  });
});

function deletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/delete-me.ts",
    "*** End Patch",
  ].join("\n");
}

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-workspace-delete-result-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "delete-me.ts"),
    "delete\n",
    "utf8",
  );
  fs.writeFileSync(path.join(workspaceRoot, "src", "other.ts"), "other\n", "utf8");
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
