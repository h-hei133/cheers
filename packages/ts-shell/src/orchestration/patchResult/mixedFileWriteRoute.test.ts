import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { runMixedFileWriteRoute } from "./mixedFileWriteRoute.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("mixed exactly-two selected-workspace write route", () => {
  it("writes update plus create after approval and verifies both operations", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, updateCreatePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: authority.deleteFile,
    });

    expect(result.status).toBe("written");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/new.ts"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.writeIntents).toEqual(["src/a.ts", "src/new.ts"]);
    expect(result.creatorInvoked).toBe(true);
    expect(result.deleteMoveInvoked).toBe(false);
    expect(result.postWriteVerification).toBe("passed");
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBe("created");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-mixed-file-write-route:exactly-two-mixed-operations",
        "apply-patch-mixed-file-write-route:all-final-preflight-before-writer",
        "apply-patch-mixed-file-write-route:parsed-order-write-no-rollback",
        "apply-patch-mixed-file-write-route:post-write-verification-passed",
      ]),
    );
  });

  it("blocks update missing, create overwrite, duplicate paths, and outside paths before any writer", async () => {
    const cases = [
      {
        patchText: updateCreatePatch(),
        files: {},
        blocker: "workspace-boundary",
      },
      {
        patchText: updateCreatePatch(),
        files: { "src/a.ts": "a = 1\n", "src/new.ts": "exists\n" },
        blocker: "target-mismatch",
      },
      {
        patchText: updateDeleteSameTargetPatch(),
        files: { "src/a.ts": "a = 1\n" },
        blocker: "target-mismatch",
      },
      {
        patchText: outsideCreatePatch(),
        files: { "src/a.ts": "a = 1\n" },
        blocker: "workspace-boundary",
      },
    ] as const;

    for (const testCase of cases) {
      const fixture = createFixture({ files: testCase.files });
      const before = snapshotFixture(fixture.workspaceRoot);
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
      let writes = 0;
      const result = await runMixedFileWriteRoute({
        ...routeOptions(fixture.workspaceRoot, testCase.patchText),
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        directoryExists: authority.directoryExists,
        validateWriteTarget: authority.validateWriteTarget,
        validateCreateTarget: authority.validateCreateTarget,
        writeFile: () => {
          writes += 1;
        },
        createFileExclusive: () => {
          writes += 1;
        },
        moveFileExclusive: () => {
          writes += 1;
        },
        deleteFile: () => {
          writes += 1;
        },
      });

      expect(result.status).toBe("blocked");
      expect(result.blocker).toBe(testCase.blocker);
      expect(result.workspaceWriterInvoked).toBe(false);
      expect(result.changedFiles).toEqual([]);
      expect(writes).toBe(0);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    }
  });

  it("projects partial failure facts without rollback when the second operation fails", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runMixedFileWriteRoute({
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

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("write-application");
    expect(result.workspaceWriterInvoked).toBe(true);
    expect(result.creatorInvoked).toBe(true);
    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.failedFiles).toEqual([
      expect.objectContaining({ path: "src/new.ts" }),
    ]);
    expect(result.postWriteVerification).toBe("blocked");
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBeUndefined();
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-mixed-file-write-route:partial-failure-stopped",
        "apply-patch-mixed-file-write-route:parsed-order-write-no-rollback",
      ]),
    );
  });

  it("writes update plus move and create plus move with pure move operations", async () => {
    for (const patchText of [updateMovePatch(), createMovePatch()]) {
      const fixture = createFixture();
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

      const result = await runMixedFileWriteRoute({
        ...routeOptions(fixture.workspaceRoot, patchText),
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        directoryExists: authority.directoryExists,
        validateWriteTarget: authority.validateWriteTarget,
        validateCreateTarget: authority.validateCreateTarget,
        writeFile: authority.writeFile,
        createFileExclusive: authority.createFileExclusive,
        moveFileExclusive: authority.moveFileExclusive,
        deleteFile: authority.deleteFile,
      });

      expect(result.status).toBe("written");
      expect(result.changedFiles).toContain("src/to.ts");
      expect(result.deleteMoveInvoked).toBe(true);
      expect(readFile(fixture.workspaceRoot, "src/from.ts")).toBeUndefined();
      expect(readFile(fixture.workspaceRoot, "src/to.ts")).toBe("from\n");
    }
  });

  it("blocks missing move source, existing move target, move conflict, and directory move before any writer", async () => {
    const cases = [
      {
        patchText: updateMovePatch(),
        files: { "src/a.ts": "a = 1\n" },
        blocker: "workspace-boundary",
      },
      {
        patchText: updateMovePatch(),
        files: {
          "src/a.ts": "a = 1\n",
          "src/from.ts": "from\n",
          "src/to.ts": "exists\n",
        },
        blocker: "target-mismatch",
      },
      {
        patchText: updateMoveConflictPatch(),
        files: { "src/from.ts": "from\n" },
        blocker: "target-mismatch",
      },
      {
        patchText: updateMovePatch(),
        files: { "src/a.ts": "a = 1\n" },
        directories: ["src/from.ts"],
        blocker: "workspace-boundary",
      },
    ] as const;

    for (const testCase of cases) {
      const fixture = createFixture({
        files: testCase.files,
        directories: testCase.directories,
      });
      const before = snapshotFixture(fixture.workspaceRoot);
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
      let writes = 0;
      const result = await runMixedFileWriteRoute({
        ...routeOptions(fixture.workspaceRoot, testCase.patchText),
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        directoryExists: authority.directoryExists,
        validateWriteTarget: authority.validateWriteTarget,
        validateCreateTarget: authority.validateCreateTarget,
        writeFile: () => {
          writes += 1;
        },
        createFileExclusive: () => {
          writes += 1;
        },
        moveFileExclusive: () => {
          writes += 1;
        },
        deleteFile: () => {
          writes += 1;
        },
      });

      expect(result.status).toBe("blocked");
      expect(result.blocker).toBe(testCase.blocker);
      expect(result.workspaceWriterInvoked).toBe(false);
      expect(writes).toBe(0);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    }
  });

  it("writes update/delete, create/delete, and move/delete lanes when all guards pass", async () => {
    for (const patchText of [updateDeletePatch(), createDeletePatch(), moveDeletePatch()]) {
      const fixture = createFixture();
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

      const result = await runMixedFileWriteRoute({
        ...routeOptions(fixture.workspaceRoot, patchText),
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        directoryExists: authority.directoryExists,
        validateWriteTarget: authority.validateWriteTarget,
        validateCreateTarget: authority.validateCreateTarget,
        writeFile: authority.writeFile,
        createFileExclusive: authority.createFileExclusive,
        moveFileExclusive: authority.moveFileExclusive,
        deleteFile: authority.deleteFile,
      });

      expect(result.status).toBe("written");
      expect(result.deleteMoveInvoked).toBe(true);
      expect(result.postWriteVerification).toBe("passed");
      expect(readFile(fixture.workspaceRoot, "src/remove.ts")).toBeUndefined();
    }
  });

  it("blocks missing delete target, directory delete, and delete conflicts before any writer", async () => {
    const cases = [
      {
        patchText: updateDeletePatch(),
        files: { "src/a.ts": "a = 1\n" },
        blocker: "workspace-boundary",
      },
      {
        patchText: updateDeletePatch(),
        files: { "src/a.ts": "a = 1\n" },
        directories: ["src/remove.ts"],
        blocker: "workspace-boundary",
      },
      {
        patchText: updateDeleteSameTargetPatch(),
        files: { "src/a.ts": "a = 1\n" },
        blocker: "target-mismatch",
      },
    ] as const;

    for (const testCase of cases) {
      const fixture = createFixture({
        files: testCase.files,
        directories: testCase.directories,
      });
      const before = snapshotFixture(fixture.workspaceRoot);
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
      let writes = 0;
      const result = await runMixedFileWriteRoute({
        ...routeOptions(fixture.workspaceRoot, testCase.patchText),
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        directoryExists: authority.directoryExists,
        validateWriteTarget: authority.validateWriteTarget,
        validateCreateTarget: authority.validateCreateTarget,
        writeFile: () => {
          writes += 1;
        },
        createFileExclusive: () => {
          writes += 1;
        },
        moveFileExclusive: () => {
          writes += 1;
        },
        deleteFile: () => {
          writes += 1;
        },
      });

      expect(result.status).toBe("blocked");
      expect(result.blocker).toBe(testCase.blocker);
      expect(result.workspaceWriterInvoked).toBe(false);
      expect(writes).toBe(0);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    }
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

function createFixture(options?: {
  readonly files?: Record<string, string>;
  readonly directories?: readonly string[];
}) {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "mixed-file-write-route-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  const files = options?.files ?? {
    "src/a.ts": "a = 1\n",
    "src/from.ts": "from\n",
    "src/remove.ts": "remove\n",
  };
  for (const directory of options?.directories ?? []) {
    fs.mkdirSync(path.join(workspaceRoot, directory), { recursive: true });
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
  return { workspaceRoot };
}

function snapshotFixture(workspaceRoot: string): Record<string, string> {
  const srcRoot = path.join(workspaceRoot, "src");
  const snapshot: Record<string, string> = {};
  if (!fs.existsSync(srcRoot)) {
    return snapshot;
  }
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (entry.isFile()) {
      snapshot[`src/${entry.name}`] = fs.readFileSync(
        path.join(srcRoot, entry.name),
        "utf8",
      );
    }
  }
  return snapshot;
}

function readFile(workspaceRoot: string, relativePath: string): string | undefined {
  try {
    return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
  } catch {
    return undefined;
  }
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

function updateDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Delete File: src/remove.ts",
    "*** End Patch",
  ].join("\n");
}

function createDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: src/new.ts",
    "+created",
    "*** Delete File: src/remove.ts",
    "*** End Patch",
  ].join("\n");
}

function updateMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    " from",
    "*** End Patch",
  ].join("\n");
}

function createMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: src/new.ts",
    "+created",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    " from",
    "*** End Patch",
  ].join("\n");
}

function moveDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    " from",
    "*** Delete File: src/remove.ts",
    "*** End Patch",
  ].join("\n");
}

function updateMoveConflictPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/from.ts",
    "@@",
    "-from",
    "+updated",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    " from",
    "*** End Patch",
  ].join("\n");
}

function updateDeleteSameTargetPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Delete File: src/a.ts",
    "*** End Patch",
  ].join("\n");
}

function outsideCreatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Add File: ../outside.ts",
    "+outside",
    "*** End Patch",
  ].join("\n");
}
