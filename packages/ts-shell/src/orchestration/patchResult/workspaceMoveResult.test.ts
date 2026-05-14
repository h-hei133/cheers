import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { runWorkspaceMoveRoute } from "./workspaceMoveRoute.js";
import { buildWorkspaceMoveRouteResult } from "./workspaceMoveResult.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("workspace move route result projection", () => {
  it("projects a guarded move stop without changed files or delete/move writer flags", () => {
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

    const route = runWorkspaceMoveRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: patchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
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
});

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
