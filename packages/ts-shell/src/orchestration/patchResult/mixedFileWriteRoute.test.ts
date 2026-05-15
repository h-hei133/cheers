import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readRecoveryAuthorityRecord } from "../patchRecovery/recoveryAuthorityStore.js";
import { restoreRecoveryAuthorityRecord } from "../patchRecovery/restorePrimitive.js";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { runMixedFileWriteRoute } from "./mixedFileWriteRoute.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("mixed selected-workspace write route", () => {
  it("writes update plus create after approval and verifies both operations", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();
    let firstWriteSawRecords = false;

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, updateCreatePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: async (relativePath, content) => {
        if (!firstWriteSawRecords) {
          const updateRecord = await readRecoveryAuthorityRecord({
            ledgerRoot,
            authorityId: "route-mixed",
            recordId: "update-1-src-a.ts",
          });
          const createRecord = await readRecoveryAuthorityRecord({
            ledgerRoot,
            authorityId: "route-mixed",
            recordId: "create-2-src-new.ts",
          });
          firstWriteSawRecords = Boolean(updateRecord && createRecord);
        }
        await authority.writeFile(relativePath, content);
      },
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: authority.deleteFile,
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-mixed",
      },
    });

    expect(result.status).toBe("written");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/new.ts"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.writeIntents).toEqual(["src/a.ts", "src/new.ts"]);
    expect(result.creatorInvoked).toBe(true);
    expect(result.deleteMoveInvoked).toBe(false);
    expect(result.postWriteVerification).toBe("passed");
    expect(firstWriteSawRecords).toBe(true);
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(2);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBe("created");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-mixed-file-write-route:exactly-2-mixed-operations",
        "apply-patch-mixed-file-write-route:all-final-preflight-before-writer",
        "apply-patch-mixed-file-write-route:parsed-order-write-no-rollback",
        "apply-patch-mixed-file-write-route:post-write-verification-passed",
      ]),
    );
  });

  it("writes update plus create plus delete after approval and captures all recovery authority before writing", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();
    let firstWriteSawRecords = false;

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, updateCreateDeletePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: async (relativePath, content) => {
        if (!firstWriteSawRecords) {
          const updateRecord = await readRecoveryAuthorityRecord({
            ledgerRoot,
            authorityId: "route-mixed-three",
            recordId: "update-1-src-a.ts",
          });
          const createRecord = await readRecoveryAuthorityRecord({
            ledgerRoot,
            authorityId: "route-mixed-three",
            recordId: "create-2-src-new.ts",
          });
          const deleteRecord = await readRecoveryAuthorityRecord({
            ledgerRoot,
            authorityId: "route-mixed-three",
            recordId: "delete-3-src-remove.ts",
          });
          firstWriteSawRecords = Boolean(
            updateRecord && createRecord && deleteRecord,
          );
        }
        await authority.writeFile(relativePath, content);
      },
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: authority.deleteFile,
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-mixed-three",
      },
    });

    expect(result.status).toBe("written");
    expect(result.changedFiles).toEqual([
      "src/a.ts",
      "src/new.ts",
      "src/remove.ts",
    ]);
    expect(result.failedFiles).toEqual([]);
    expect(result.writeIntents).toEqual([
      "src/a.ts",
      "src/new.ts",
      "src/remove.ts",
    ]);
    expect(result.creatorInvoked).toBe(true);
    expect(result.deleteMoveInvoked).toBe(true);
    expect(result.postWriteVerification).toBe("passed");
    expect(firstWriteSawRecords).toBe(true);
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(3);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBe("created");
    expect(readFile(fixture.workspaceRoot, "src/remove.ts")).toBeUndefined();
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-mixed-file-write-route:exactly-3-mixed-operations",
        "apply-patch-mixed-file-write-route:no-5-plus-mixed",
        "apply-patch-mixed-file-write-route:no-broad-apply-patch",
      ]),
    );
  });

  it("restores a verified mixed prefix file after partial failure and blocks hidden edits", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

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
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-mixed-restore",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("write-application");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.failedFiles[0]?.path).toBe("src/new.ts");
    expect(result.postWriteVerification).toBe("blocked");

    const restore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-mixed-restore",
      recordId: "update-1-src-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/a.ts",
    });
    expect(restore.restored).toBe(true);
    expect(restore.rollbackAtomicityClaim).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 1\n");

    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "a.ts"),
      "hidden-user-edit\n",
      "utf8",
    );
    const blockedRestore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-mixed-restore",
      recordId: "update-1-src-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/a.ts",
    });
    expect(blockedRestore.restored).toBe(false);
    expect(blockedRestore.blockedReason).toBe("current-content-hash-mismatch");
  });

  it("restores exactly-three update/create prefix after delete failure and blocks hidden create edits", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runMixedFileWriteRoute({
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
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-mixed-three-restore",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("write-application");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(3);
    expect(result.changedFiles).toEqual(["src/a.ts", "src/new.ts"]);
    expect(result.failedFiles[0]?.path).toBe("src/remove.ts");
    expect(result.postWriteVerification).toBe("blocked");

    const restoreUpdate = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-mixed-three-restore",
      recordId: "update-1-src-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/a.ts",
    });
    expect(restoreUpdate.restored).toBe(true);
    expect(restoreUpdate.rollbackAtomicityClaim).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 1\n");

    const restoreCreate = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-mixed-three-restore",
      recordId: "create-2-src-new.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/new.ts",
    });
    expect(restoreCreate.restored).toBe(true);
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBeUndefined();

    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "new.ts"),
      "hidden-user-edit\n",
      "utf8",
    );
    const blockedCreateRestore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-mixed-three-restore",
      recordId: "create-2-src-new.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/new.ts",
    });
    expect(blockedCreateRestore.restored).toBe(false);
    expect(blockedCreateRestore.blockedReason).toBe(
      "current-content-hash-mismatch",
    );
  });

  it("restores exactly-three update/delete prefix after move failure without atomic rollback claim", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, updateDeleteMovePatch()),
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
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-mixed-three-move-restore",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("write-application");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(4);
    expect(result.changedFiles).toEqual(["src/a.ts", "src/remove.ts"]);
    expect(result.failedFiles[0]?.path).toBe("src/to.ts");
    expect(result.deleteMoveInvoked).toBe(true);

    const restoreDelete = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-mixed-three-move-restore",
      recordId: "delete-2-src-remove.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/remove.ts",
    });
    expect(restoreDelete.restored).toBe(true);
    expect(restoreDelete.rollbackAtomicityClaim).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/remove.ts")).toBe("remove\n");
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

  it("writes exactly-four mixed operations and captures all before-states before writing", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, fourMixedPatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: authority.deleteFile,
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-four-mixed",
      },
    });

    expect(result.status).toBe("written");
    expect(result.changedFiles).toEqual([
      "src/a.ts",
      "src/new.ts",
      "src/remove.ts",
      "src/to.ts",
    ]);
    expect(result.creatorInvoked).toBe(true);
    expect(result.deleteMoveInvoked).toBe(true);
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(5);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBe("created");
    expect(readFile(fixture.workspaceRoot, "src/remove.ts")).toBeUndefined();
    expect(readFile(fixture.workspaceRoot, "src/to.ts")).toBe("from\n");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-mixed-file-write-route:exactly-4-mixed-operations",
        "apply-patch-mixed-file-write-route:no-5-plus-mixed",
      ]),
    );
  });

  it("restores exactly-four mixed changed records after partial failure without automatic rollback", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, fourMixedPatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: () => {
        throw new Error("simulated fourth mixed move failure");
      },
      deleteFile: authority.deleteFile,
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-four-mixed-restore",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("write-application");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/new.ts", "src/remove.ts"]);
    expect(result.failedFiles[0]?.path).toBe("src/to.ts");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(5);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBe("created");
    expect(readFile(fixture.workspaceRoot, "src/remove.ts")).toBeUndefined();

    const restoreUpdate = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-four-mixed-restore",
      recordId: "update-1-src-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/a.ts",
    });
    expect(restoreUpdate.restored).toBe(true);
    expect(restoreUpdate.rollbackAtomicityClaim).toBe(false);

    const restoreCreate = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-four-mixed-restore",
      recordId: "create-2-src-new.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/new.ts",
    });
    expect(restoreCreate.restored).toBe(true);
    expect(restoreCreate.rollbackAtomicityClaim).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBeUndefined();
  });

  it("restores an eight-operation mixed prefix after partial failure without automatic rollback", async () => {
    const fixture = createFixture({
      files: {
        "src/a.ts": "a = 1\n",
        "src/b.ts": "b = 1\n",
        "src/c.ts": "c = 1\n",
        "src/remove-a.ts": "remove a\n",
        "src/remove-b.ts": "remove b\n",
        "src/from-a.ts": "move a\n",
      },
    });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, eightMixedPatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: (sourcePath, targetPath) => {
        if (sourcePath === "src/from-a.ts") {
          throw new Error("simulated eighth mixed move failure");
        }
        authority.moveFileExclusive(sourcePath, targetPath);
      },
      deleteFile: authority.deleteFile,
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-eight-mixed-restore",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.changedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/new-a.ts",
      "src/new-b.ts",
      "src/remove-a.ts",
      "src/remove-b.ts",
    ]);
    expect(result.failedFiles[0]?.path).toBe("src/to-a.ts");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(9);
    expect(result.postWriteVerification).toBe("blocked");

    const restoreUpdate = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-eight-mixed-restore",
      recordId: "update-1-src-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/a.ts",
    });
    expect(restoreUpdate.restored).toBe(true);
    expect(restoreUpdate.rollbackAtomicityClaim).toBe(false);

    const restoreCreate = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-eight-mixed-restore",
      recordId: "create-4-src-new-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/new-a.ts",
    });
    expect(restoreCreate.restored).toBe(true);
    expect(restoreCreate.rollbackAtomicityClaim).toBe(false);
  });

  it("writes five mixed operations with no default recovery-authority capture", async () => {
    const fixture = createFixture({
      files: {
        "src/a.ts": "a = 1\n",
        "src/b.ts": "b = 1\n",
        "src/from.ts": "from\n",
        "src/remove.ts": "remove\n",
      },
    });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, fiveMixedPatch()),
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
    expect(result.recoveryAuthorityCapture).toBeUndefined();
    expect(result.workspaceWriterInvoked).toBe(true);
    expect(result.changedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/new.ts",
      "src/remove.ts",
      "src/to.ts",
    ]);
    expect(result.postWriteVerification).toBe("passed");
  });

  it.each([16, 32])(
    "writes %i mixed operations under the bounded small-N policy",
    async (count) => {
      const patch = generatedMixedPatch(count);
      const fixture = createFixture({ files: generatedMixedFiles(count) });
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

      const result = await runMixedFileWriteRoute({
        ...routeOptions(fixture.workspaceRoot, patch),
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
      expect(result.changedFiles).toHaveLength(count);
      expect(result.failedFiles).toEqual([]);
      expect(result.postWriteVerification).toBe("passed");
      expect(result.recoveryAuthorityCapture).toBeUndefined();
      expect(result.workspaceWriterInvoked).toBe(true);
    },
  );

  it("keeps 33 mixed operations blocked with no default recovery-authority capture", async () => {
    const fixture = createFixture({
      files: generatedMixedFiles(33),
    });
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    let writes = 0;

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, generatedMixedPatch(33)),
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
    expect(result.blocker).toBe("unsupported-operation");
    expect(result.recoveryAuthorityCapture).toBeUndefined();
    expect(result.workspaceWriterInvoked).toBe(false);
    expect(result.changedFiles).toEqual([]);
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
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

  it("writes exactly-four delete-only operations after approval and captures all originals before deleting", async () => {
    const fixture = createFixture({
      files: {
        "src/remove-a.ts": "a\n",
        "src/remove-b.ts": "b\n",
        "src/remove-c.ts": "c\n",
        "src/remove-d.ts": "d\n",
      },
    });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();
    let firstDeleteSawRecords = false;

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, fourDeletePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: async (relativePath) => {
        if (!firstDeleteSawRecords) {
          firstDeleteSawRecords = Boolean(
            await readRecoveryAuthorityRecord({
              ledgerRoot,
              authorityId: "route-three-delete",
              recordId: "delete-1-src-remove-a.ts",
            }),
          );
        }
        await authority.deleteFile(relativePath);
      },
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-three-delete",
      },
    });

    expect(result.status).toBe("written");
    expect(result.changedFiles).toEqual([
      "src/remove-a.ts",
      "src/remove-b.ts",
      "src/remove-c.ts",
      "src/remove-d.ts",
    ]);
    expect(result.deleteMoveInvoked).toBe(true);
    expect(result.postWriteVerification).toBe("passed");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(4);
    expect(firstDeleteSawRecords).toBe(true);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({});
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-mixed-file-write-route:bounded-delete-only",
        "apply-patch-mixed-file-write-route:parsed-order-write-no-rollback",
      ]),
    );
  });

  it("writes exactly-four move-only operations and captures source plus target recovery authority", async () => {
    const fixture = createFixture({
      files: {
        "src/from-a.ts": "a\n",
        "src/from-b.ts": "b\n",
        "src/from-c.ts": "c\n",
        "src/from-d.ts": "d\n",
      },
    });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, fourMovePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: authority.deleteFile,
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-two-move",
      },
    });

    expect(result.status).toBe("written");
    expect(result.changedFiles).toEqual([
      "src/to-a.ts",
      "src/to-b.ts",
      "src/to-c.ts",
      "src/to-d.ts",
    ]);
    expect(result.deleteMoveInvoked).toBe(true);
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceRelativePath: "src/from-a.ts",
          beforeState: "exists",
          expectedCurrentState: "absent",
        }),
        expect.objectContaining({
          workspaceRelativePath: "src/to-a.ts",
          beforeState: "absent",
          expectedCurrentState: "exists",
        }),
      ]),
    );
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(8);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/to-a.ts": "a\n",
      "src/to-b.ts": "b\n",
      "src/to-c.ts": "c\n",
      "src/to-d.ts": "d\n",
    });
  });

  it.each([
    { family: "delete-only", count: 5, patchText: deletePatch(5) },
    { family: "delete-only", count: 8, patchText: deletePatch(8) },
    { family: "delete-only", count: 9, patchText: deletePatch(9) },
    { family: "delete-only", count: 16, patchText: deletePatch(16) },
    { family: "delete-only", count: 32, patchText: deletePatch(32) },
    { family: "move-only", count: 5, patchText: movePatch(5) },
    { family: "move-only", count: 8, patchText: movePatch(8) },
    { family: "move-only", count: 9, patchText: movePatch(9) },
    { family: "move-only", count: 16, patchText: movePatch(16) },
    { family: "move-only", count: 32, patchText: movePatch(32) },
  ])("writes $count $family operations under the bounded small-N policy", async ({
    family,
    count,
    patchText,
  }) => {
    const fixture = createFixture({
      files:
        family === "delete-only"
          ? removeFiles(count)
          : fromFiles(count),
    });
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
    expect(result.changedFiles).toHaveLength(count);
    expect(result.failedFiles).toEqual([]);
    expect(result.postWriteVerification).toBe("passed");
    expect(result.deleteMoveInvoked).toBe(true);
  });

  it("restores an exactly-four delete-only prefix after partial failure and blocks hidden recreation", async () => {
    const fixture = createFixture({
      files: {
        "src/remove-a.ts": "a\n",
        "src/remove-b.ts": "b\n",
        "src/remove-c.ts": "c\n",
        "src/remove-d.ts": "d\n",
      },
    });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, fourDeletePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: async (relativePath) => {
        if (relativePath === "src/remove-d.ts") {
          throw new Error("simulated delete failure");
        }
        await authority.deleteFile(relativePath);
      },
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-delete-restore",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.changedFiles).toEqual([
      "src/remove-a.ts",
      "src/remove-b.ts",
      "src/remove-c.ts",
    ]);
    expect(result.failedFiles[0]?.path).toBe("src/remove-d.ts");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");

    const restore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-delete-restore",
      recordId: "delete-1-src-remove-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/remove-a.ts",
    });
    expect(restore.restored).toBe(true);
    expect(restore.rollbackAtomicityClaim).toBe(false);

    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "remove-a.ts"),
      "hidden\n",
      "utf8",
    );
    const blockedRestore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-delete-restore",
      recordId: "delete-1-src-remove-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/remove-a.ts",
    });
    expect(blockedRestore.restored).toBe(false);
    expect(blockedRestore.blockedReason).toBe("current-state-mismatch");
  });

  it("restores an eight-file delete-only prefix after partial failure and blocks hidden recreation", async () => {
    const fixture = createFixture({ files: removeFiles(8) });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, deletePatch(8)),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: async (relativePath) => {
        if (relativePath === "src/remove-h.ts") {
          throw new Error("simulated eighth delete failure");
        }
        await authority.deleteFile(relativePath);
      },
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-eight-delete-restore",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.changedFiles).toHaveLength(7);
    expect(result.failedFiles[0]?.path).toBe("src/remove-h.ts");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(8);
    expect(result.postWriteVerification).toBe("blocked");

    const restore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-eight-delete-restore",
      recordId: "delete-1-src-remove-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/remove-a.ts",
    });
    expect(restore.restored).toBe(true);
    expect(restore.rollbackAtomicityClaim).toBe(false);

    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "remove-a.ts"),
      "hidden\n",
      "utf8",
    );
    const blockedRestore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-eight-delete-restore",
      recordId: "delete-1-src-remove-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/remove-a.ts",
    });
    expect(blockedRestore.restored).toBe(false);
    expect(blockedRestore.blockedReason).toBe("current-state-mismatch");
  });

  it("restores an exactly-four move-only prefix after partial failure and blocks hidden target edits", async () => {
    const fixture = createFixture({
      files: {
        "src/from-a.ts": "a\n",
        "src/from-b.ts": "b\n",
        "src/from-c.ts": "c\n",
        "src/from-d.ts": "d\n",
      },
    });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, fourMovePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: async (sourcePath, targetPath) => {
        if (sourcePath === "src/from-d.ts") {
          throw new Error("simulated move failure");
        }
        await authority.moveFileExclusive(sourcePath, targetPath);
      },
      deleteFile: authority.deleteFile,
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-move-restore",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("write-application");
    expect(result.changedFiles).toEqual(["src/to-a.ts", "src/to-b.ts", "src/to-c.ts"]);
    expect(result.failedFiles[0]?.path).toBe("src/to-d.ts");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(8);
    expect(result.postWriteVerification).toBe("blocked");

    const restoreSource = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-move-restore",
      recordId: "move-1-src-from-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/from-a.ts",
    });
    expect(restoreSource.restored).toBe(true);
    expect(restoreSource.rollbackAtomicityClaim).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/from-a.ts")).toBe("a\n");

    const restoreTarget = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-move-restore",
      recordId: "move-target-1-src-to-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/to-a.ts",
    });
    expect(restoreTarget.restored).toBe(true);
    expect(restoreTarget.rollbackAtomicityClaim).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/to-a.ts")).toBeUndefined();

    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "to-a.ts"),
      "hidden\n",
      "utf8",
    );
    const blockedTargetRestore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-move-restore",
      recordId: "move-target-1-src-to-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/to-a.ts",
    });
    expect(blockedTargetRestore.restored).toBe(false);
    expect(blockedTargetRestore.blockedReason).toBe(
      "current-content-hash-mismatch",
    );
  });

  it("restores an eight-move prefix after partial failure and blocks hidden target edits", async () => {
    const fixture = createFixture({ files: fromFiles(8) });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, movePatch(8)),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: authority.createFileExclusive,
      moveFileExclusive: async (sourcePath, targetPath) => {
        if (sourcePath === "src/from-h.ts") {
          throw new Error("simulated eighth move failure");
        }
        await authority.moveFileExclusive(sourcePath, targetPath);
      },
      deleteFile: authority.deleteFile,
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-eight-move-restore",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.changedFiles).toHaveLength(7);
    expect(result.failedFiles[0]?.path).toBe("src/to-h.ts");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    expect(result.recoveryAuthorityCapture?.records).toHaveLength(16);
    expect(result.postWriteVerification).toBe("blocked");

    const restoreTarget = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-eight-move-restore",
      recordId: "move-target-1-src-to-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/to-a.ts",
    });
    expect(restoreTarget.restored).toBe(true);
    expect(restoreTarget.rollbackAtomicityClaim).toBe(false);

    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "to-a.ts"),
      "hidden\n",
      "utf8",
    );
    const blockedTargetRestore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-eight-move-restore",
      recordId: "move-target-1-src-to-a.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/to-a.ts",
    });
    expect(blockedTargetRestore.restored).toBe(false);
    expect(blockedTargetRestore.blockedReason).toBe(
      "current-content-hash-mismatch",
    );
  });

  it("keeps destructive unsupported shapes blocked before any writer", async () => {
    const cases = [
      { patchText: beyondCapDeletePatch(), blocker: "unsupported-operation" },
      { patchText: beyondCapMovePatch(), blocker: "unsupported-operation" },
      { patchText: duplicateMoveTargetPatch(), blocker: "target-mismatch" },
      { patchText: moveSwapPatch(), blocker: "target-mismatch" },
    ] as const;

    for (const testCase of cases) {
      const fixture = createFixture({
        files: {
          ...fromFiles(33),
          ...removeFiles(33),
        },
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
      expect(result.recoveryAuthorityCapture).toBeUndefined();
      expect(writes).toBe(0);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
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

function createLedgerRoot(): string {
  const ledgerRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "mixed-file-ledger-"),
  );
  tempRoots.push(ledgerRoot);
  return ledgerRoot;
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

function updateDeleteMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Delete File: src/remove.ts",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    " from",
    "*** End Patch",
  ].join("\n");
}

function fourMixedPatch(): string {
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

function fiveMixedPatch(): string {
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

function eightMixedPatch(): string {
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
    "*** Add File: src/new-a.ts",
    "+created a",
    "*** Add File: src/new-b.ts",
    "+created b",
    "*** Delete File: src/remove-a.ts",
    "*** Delete File: src/remove-b.ts",
    "*** Update File: src/from-a.ts",
    "*** Move to: src/to-a.ts",
    "@@",
    " move a",
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

function twoDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/remove-a.ts",
    "*** Delete File: src/remove-b.ts",
    "*** End Patch",
  ].join("\n");
}

function threeDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/remove-a.ts",
    "*** Delete File: src/remove-b.ts",
    "*** Delete File: src/remove-c.ts",
    "*** End Patch",
  ].join("\n");
}

function fourDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/remove-a.ts",
    "*** Delete File: src/remove-b.ts",
    "*** Delete File: src/remove-c.ts",
    "*** Delete File: src/remove-d.ts",
    "*** End Patch",
  ].join("\n");
}

function fiveDeletePatch(): string {
  return deletePatch(5);
}

function beyondCapDeletePatch(): string {
  return deletePatch(33);
}

function deletePatch(count: number): string {
  return [
    "*** Begin Patch",
    ...Array.from({ length: count }, (_, index) => {
      const suffix = fileSuffix(index);
      return `*** Delete File: src/remove-${suffix}.ts`;
    }),
    "*** End Patch",
  ].join("\n");
}

function twoMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/from-a.ts",
    "*** Move to: src/to-a.ts",
    "@@",
    " a",
    "*** Update File: src/from-b.ts",
    "*** Move to: src/to-b.ts",
    "@@",
    " b",
    "*** End Patch",
  ].join("\n");
}

function fourMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/from-a.ts",
    "*** Move to: src/to-a.ts",
    "@@",
    " a",
    "*** Update File: src/from-b.ts",
    "*** Move to: src/to-b.ts",
    "@@",
    " b",
    "*** Update File: src/from-c.ts",
    "*** Move to: src/to-c.ts",
    "@@",
    " c",
    "*** Update File: src/from-d.ts",
    "*** Move to: src/to-d.ts",
    "@@",
    " d",
    "*** End Patch",
  ].join("\n");
}

function fiveMovePatch(): string {
  return movePatch(5);
}

function beyondCapMovePatch(): string {
  return movePatch(33);
}

function movePatch(count: number): string {
  return [
    "*** Begin Patch",
    ...Array.from({ length: count }, (_, index) => fileSuffix(index)).flatMap((suffix) => [
      `*** Update File: src/from-${suffix}.ts`,
      `*** Move to: src/to-${suffix}.ts`,
      "@@",
      ` ${suffix}`,
    ]),
    "*** End Patch",
  ].join("\n");
}

function duplicateMoveTargetPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/from-a.ts",
    "*** Move to: src/to-same.ts",
    "@@",
    " a",
    "*** Update File: src/from-b.ts",
    "*** Move to: src/to-same.ts",
    "@@",
    " b",
    "*** End Patch",
  ].join("\n");
}

function moveSwapPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/from-a.ts",
    "*** Move to: src/from-b.ts",
    "@@",
    " a",
    "*** Update File: src/from-b.ts",
    "*** Move to: src/from-a.ts",
    "@@",
    " b",
    "*** End Patch",
  ].join("\n");
}

function removeFiles(count: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const suffix = fileSuffix(index);
      return [`src/remove-${suffix}.ts`, `${suffix}\n`];
    }),
  );
}

function fromFiles(count: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const suffix = fileSuffix(index);
      return [`src/from-${suffix}.ts`, `${suffix}\n`];
    }),
  );
}

function generatedMixedPatch(count: number): string {
  return [
    "*** Begin Patch",
    ...Array.from({ length: count }, (_, index) => {
      const suffix = fileSuffix(index);
      const mod = index % 4;
      if (mod === 0) {
        return [
          `*** Update File: src/update-${suffix}.ts`,
          "@@",
          `-${suffix} = 1`,
          `+${suffix} = 2`,
        ];
      }
      if (mod === 1) {
        return [`*** Add File: src/new-${suffix}.ts`, `+new ${suffix}`];
      }
      if (mod === 2) {
        return [`*** Delete File: src/remove-${suffix}.ts`];
      }
      return [
        `*** Update File: src/from-${suffix}.ts`,
        `*** Move to: src/to-${suffix}.ts`,
        "@@",
        ` ${suffix}`,
      ];
    }).flat(),
    "*** End Patch",
  ].join("\n");
}

function generatedMixedFiles(count: number): Record<string, string> {
  const files: Record<string, string> = {};
  for (let index = 0; index < count; index += 1) {
    const suffix = fileSuffix(index);
    if (index % 4 === 0) {
      files[`src/update-${suffix}.ts`] = `${suffix} = 1\n`;
    } else if (index % 4 === 2) {
      files[`src/remove-${suffix}.ts`] = `${suffix}\n`;
    } else if (index % 4 === 3) {
      files[`src/from-${suffix}.ts`] = `${suffix}\n`;
    }
  }
  return files;
}

function fileSuffix(index: number): string {
  return index < 26 ? "abcdefghijklmnopqrstuvwxyz"[index] ?? "" : `file-${index + 1}`;
}
