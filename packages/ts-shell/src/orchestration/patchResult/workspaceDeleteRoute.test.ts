import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readRecoveryAuthorityRecord } from "../patchRecovery/recoveryAuthorityStore.js";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { runWorkspaceDeleteRoute } from "./workspaceDeleteRoute.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("single-file Delete File selected-workspace route", () => {
  it("deletes one selected workspace file after guards and verifies target absence", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceDeleteRoute({
      ...routeOptions(fixture.workspaceRoot, deletePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      deleteFile: authority.deleteFile,
    });

    expect(result.status).toBe("deleted");
    expect(result.targetPath).toBe("src/delete-me.ts");
    expect(result.changedFiles).toEqual(["src/delete-me.ts"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.plannedFiles).toEqual([]);
    expect(result.writeIntents).toEqual(["src/delete-me.ts"]);
    expect(result.workspaceWriterInvoked).toBe(true);
    expect(result.deleteMoveInvoked).toBe(true);
    expect(result.postWriteVerification).toBe("passed");
    expect(result.terminalClassification).toBe("success");
    expect(result.terminalSuccessAllowed).toBe(true);
    expect(result.mutationSuccessClaimAllowed).toBe(true);
    expect(result.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        operationKind: "delete",
        targetPath: "src/delete-me.ts",
        supportStatus: "supported-write",
        writeIntent: "eligible",
      }),
    ]);
    expect(result.perFilePatchPlan?.summary).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/delete-me.ts"],
      }),
    );
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-delete-route:delete-writer-invoked",
        "apply-patch-workspace-delete-route:post-write-verification-passed",
        "apply-patch-workspace-delete-route:success-after-verified-delete",
      ]),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/other.ts": "other\n",
    });
    expect("recoveryAuthorityCapture" in result).toBe(false);
  });

  it("captures deleted file original content only under explicit recovery authority", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runWorkspaceDeleteRoute({
      ...routeOptions(fixture.workspaceRoot, deletePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      deleteFile: authority.deleteFile,
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-delete",
      },
    });

    expect(result.status).toBe("deleted");
    expect(result.changedFiles).toEqual(["src/delete-me.ts"]);
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    const record = result.recoveryAuthorityCapture?.records[0];
    expect(record).toEqual(
      expect.objectContaining({
        workspaceRelativePath: "src/delete-me.ts",
        operationKind: "delete",
        beforeState: "exists",
        expectedCurrentState: "absent",
      }),
    );
    expect(await readRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-delete",
      recordId: "delete-src-delete-me.ts",
    })).toEqual(record);
  });

  it.each([
    {
      name: "outside target",
      patchText: deletePatch("../outside.ts"),
      expectedBlocker: "workspace-boundary",
      expectedCode: "patch-verify-path-outside-workspace",
    },
    {
      name: "missing target",
      patchText: deletePatch("src/missing.ts"),
      expectedBlocker: "workspace-boundary",
      expectedCode: "patch-verify-file-missing",
    },
    {
      name: "directory target",
      patchText: deletePatch("src/dir"),
      expectedBlocker: "workspace-boundary",
      expectedCode: "patch-apply-plan-not-verified",
    },
  ])(
    "blocks $name before any writer or success claim",
    async ({ patchText, expectedBlocker, expectedCode }) => {
      const fixture = createFixture({ includeDirectoryTarget: true });
      const before = snapshotFixture(fixture.workspaceRoot);
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

      const result = await runWorkspaceDeleteRoute({
        ...routeOptions(fixture.workspaceRoot, patchText),
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        directoryExists: authority.directoryExists,
        validateWriteTarget: authority.validateWriteTarget,
        deleteFile: authority.deleteFile,
      });

      expect(result.status).toBe("blocked");
      expect(result.blocker).toBe(expectedBlocker);
      expect(result.failures[0]?.code).toBe(expectedCode);
      expectNoWrite(result);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    },
  );

  it.each([
    {
      name: "mixed update plus delete",
      patchText: mixedUpdateDeletePatch(),
      expectedBlocker: "unsupported-operation",
    },
    {
      name: "move",
      patchText: movePatch(),
      expectedBlocker: "unsupported-operation",
    },
    {
      name: "broad apply_patch",
      patchText: broadPatch(),
      expectedBlocker: "patch-parse",
    },
  ])("keeps $name no-write", async ({ patchText, expectedBlocker }) => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceDeleteRoute({
      ...routeOptions(fixture.workspaceRoot, patchText),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      deleteFile: authority.deleteFile,
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe(expectedBlocker);
    expectNoWrite(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("surfaces post-delete verification failure without rollback", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceDeleteRoute({
      ...routeOptions(fixture.workspaceRoot, deletePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      deleteFile: () => {
        // Simulates an unlink call that returned but did not remove the target.
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("post-write-verification");
    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles).toEqual([
      expect.objectContaining({ path: "src/delete-me.ts" }),
    ]);
    expect(result.workspaceWriterInvoked).toBe(true);
    expect(result.deleteMoveInvoked).toBe(true);
    expect(result.postWriteVerification).toBe("failed");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-delete-route:post-write-verification-blocked",
        "apply-patch-workspace-delete-route:no-rollback",
        "apply-patch-workspace-delete-route:writer-invoked-no-success-claim",
      ]),
    );
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      "src/delete-me.ts": "delete\n",
      "src/other.ts": "other\n",
    });
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

function deletePatch(targetPath = "src/delete-me.ts"): string {
  return [
    "*** Begin Patch",
    `*** Delete File: ${targetPath}`,
    "*** End Patch",
  ].join("\n");
}

function mixedUpdateDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/other.ts",
    "@@",
    "-other",
    "+changed",
    "*** Delete File: src/delete-me.ts",
    "*** End Patch",
  ].join("\n");
}

function movePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/delete-me.ts",
    "*** Move to: src/moved.ts",
    "@@",
    " delete",
    "*** End Patch",
  ].join("\n");
}

function broadPatch(): string {
  return [
    "diff --git a/src/delete-me.ts b/dev/null",
    "--- a/src/delete-me.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-delete",
  ].join("\n");
}

function createFixture(
  options: { readonly includeDirectoryTarget?: boolean } = {},
): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-workspace-delete-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "delete-me.ts"),
    "delete\n",
    "utf8",
  );
  fs.writeFileSync(path.join(workspaceRoot, "src", "other.ts"), "other\n", "utf8");
  if (options.includeDirectoryTarget) {
    fs.mkdirSync(path.join(workspaceRoot, "src", "dir"), { recursive: true });
  }
  return { workspaceRoot };
}

function createLedgerRoot(): string {
  const ledgerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "recovery-ledger-"));
  tempRoots.push(ledgerRoot);
  return ledgerRoot;
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

function expectNoWrite(
  result: Awaited<ReturnType<typeof runWorkspaceDeleteRoute>>,
): void {
  expect(result.changedFiles).toEqual([]);
  expect(result.plannedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.workspaceWriterInvoked).toBe(false);
  expect(result.deleteMoveInvoked).toBe(false);
  expect(result.writerStarted).toBe(false);
  expect(result.writeEffect).toBe("none");
  expect(result.postWriteVerification).toBe("not-run");
  expect(result.terminalSuccessAllowed).toBe(false);
  expect(result.mutationSuccessClaimAllowed).toBe(false);
}
