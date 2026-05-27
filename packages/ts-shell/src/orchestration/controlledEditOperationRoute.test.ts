import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runControlledEditOperationRoute } from "./controlledEditOperationRoute.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("runControlledEditOperationRoute", () => {
  it("creates a file only through explicit selected-workspace authority and readback", async () => {
    const fixture = createFixture();

    const result = await runControlledEditOperationRoute({
      ...routeInput(fixture.workspaceRoot, addFilePatch()),
      allowSelectedWorkspaceApply: true,
    });

    expect(result.operationKind).toBe("create-file");
    expect(result.mode).toBe("selected-workspace-apply");
    expect(result.mutationAuthority).toBe("explicit-selected-workspace");
    expect(result.changedFiles).toEqual(["src/new.ts"]);
    expect(result.applyState).toBe("applied");
    expect(result.verificationState).toBe("passed");
    expect(result.reportedSuccess).toBe(true);
    expect(result.productEdit.verdict.status).toBe("COMPLETE");
    expect(result.productEdit.readbackStatus).toBe("verified");
    expect(result.productEdit.applyIsVerificationSuccess).toBe(false);
    expect(result.result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        creatorInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBe("created");
  });

  it("previews delete and move without invoking destructive writers", async () => {
    for (const [patch, operation] of [
      [deleteFilePatch(), "delete-file-preview"],
      [moveFilePatch(), "move-or-rename-preview"],
    ] as const) {
      const fixture = createFixture();
      const before = snapshotFixture(fixture.workspaceRoot);
      const result = await runControlledEditOperationRoute({
        ...routeInput(fixture.workspaceRoot, patch),
        allowSelectedWorkspaceApply: true,
      });

      expect(result.operationKind).toBe(operation);
      expect(result.mode).toBe("preview-only");
      expect(result.previewOnly).toBe(true);
      expect(result.mutationAuthority).toBe("not-granted");
      expect(result.changedFiles).toEqual([]);
      expect(result.reportedSuccess).toBe(false);
      expect(result.result.codingResult?.perFilePatchPlan).toEqual(
        expect.objectContaining({
          writerInvoked: false,
          deleteMoveInvoked: false,
          successLike: false,
        }),
      );
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    }
  });

  it("applies a three-file exact update with per-file evidence", async () => {
    const fixture = createFixture({ includeC: true });

    const result = await runControlledEditOperationRoute({
      ...routeInput(fixture.workspaceRoot, threeFileUpdatePatch()),
      allowSelectedWorkspaceApply: true,
    });

    expect(result.operationKind).toBe("multi-file-target-set");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(result.reportedSuccess).toBe(true);
    expect(result.result.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({ operationKind: "update", targetPath: "src/a.ts" }),
      expect.objectContaining({ operationKind: "update", targetPath: "src/b.ts" }),
      expect.objectContaining({ operationKind: "update", targetPath: "src/c.ts" }),
    ]);
  });

  it("keeps partial writer failure stopped without reporting success", async () => {
    const fixture = createFixture({ includeC: true });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runControlledEditOperationRoute({
      sessionId: "route227d-partial",
      prompt: threeFileUpdatePatch(),
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: threeFileUpdatePatch(),
      allowSelectedWorkspaceApply: true,
      getWorkspaceAuthority: () => ({
        ...authority,
        writeFile: (relativePath, content) => {
          if (relativePath === "src/b.ts") {
            throw new Error("simulated second write failure");
          }
          authority.writeFile(relativePath, content);
        },
      }),
      readNoWriteRuntimeFile: readWorkspaceFile(fixture.workspaceRoot),
    });

    expect(result.operationKind).toBe("multi-file-target-set");
    expect(result.result.status).toBe("stopped_error");
    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.failedFiles).toEqual(["src/b.ts"]);
    expect(result.reportedSuccess).toBe(false);
    expect(result.productEdit.verdict.status).toBe("BLOCKED");
    expect(result.productEdit.oneFileSuccessCanHideAnotherFailure).toBe(false);
    expect(result.evidence).toContain("controlled-edit-operation-route:no-success-without-post-write-verification");
  });
});

function routeInput(workspaceRoot: string, patch: string) {
  return {
    sessionId: "route227d",
    prompt: patch,
    workspaceRoot,
    rawPatchText: patch,
    getWorkspaceAuthority: () => createWorkspaceWriteAuthority(workspaceRoot),
    readNoWriteRuntimeFile: readWorkspaceFile(workspaceRoot),
  };
}

function createFixture(options: { includeC?: boolean } = {}) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route227d-edit-"));
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "a = 1\n");
  fs.writeFileSync(path.join(workspaceRoot, "src", "b.ts"), "b = 1\n");
  if (options.includeC) {
    fs.writeFileSync(path.join(workspaceRoot, "src", "c.ts"), "c = 1\n");
  }
  return { workspaceRoot };
}

function readWorkspaceFile(workspaceRoot: string) {
  return (absolutePath: string): string | undefined => {
    const resolved = path.resolve(absolutePath);
    if (!resolved.startsWith(path.resolve(workspaceRoot))) return undefined;
    try {
      return fs.readFileSync(resolved, "utf8");
    } catch {
      return undefined;
    }
  };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function snapshotFixture(workspaceRoot: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const name of fs.readdirSync(path.join(workspaceRoot, "src"))) {
    entries[`src/${name}`] = readFile(workspaceRoot, `src/${name}`);
  }
  return entries;
}

function addFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: src/new.ts",
    "+created",
    "*** End Patch",
    "",
  ].join("\n");
}

function deleteFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/a.ts",
    "*** End Patch",
    "",
  ].join("\n");
}

function moveFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "*** Move to: src/moved.ts",
    "*** End Patch",
    "",
  ].join("\n");
}

function threeFileUpdatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/b.ts",
    "@@",
    "-b = 1",
    "+b = 2",
    "*** Update File: src/c.ts",
    "@@",
    "-c = 1",
    "+c = 2",
    "*** End Patch",
    "",
  ].join("\n");
}
