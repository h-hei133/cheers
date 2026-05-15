import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readRecoveryAuthorityRecord } from "../patchRecovery/recoveryAuthorityStore.js";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { runWorkspaceCreateRoute } from "./workspaceCreateRoute.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("single-file Add File selected-workspace create route", () => {
  it("creates exactly one new file after explicit opt-in, approval, exclusive create, and readback verification", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, addPatch("src/new.ts", "ready")),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: authority.createFileExclusive,
    });

    expect(result.status).toBe("created");
    expect(result.changedFiles).toEqual(["src/new.ts"]);
    expect(result.writeIntents).toEqual(["src/new.ts"]);
    expect(result.workspaceWriterInvoked).toBe(true);
    expect(result.writerTarget).toBe("selected-workspace");
    expect(result.selectedWorkspaceWrite).toBe(true);
    expect(result.writerStarted).toBe(true);
    expect(result.writeEffect).toBe("verified");
    expect(result.postWriteVerification).toBe("passed");
    expect(result.terminalClassification).toBe("success");
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBe("ready");
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
      ...before,
      "src/new.ts": "ready",
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-workspace-create-route:single-file-add-only",
        "apply-patch-workspace-create-route:exclusive-create",
        "apply-patch-workspace-create-route:post-write-verification-passed",
        "apply-patch-workspace-create-route:success-after-verified-create",
      ]),
    );
    expect("recoveryAuthorityCapture" in result).toBe(false);
  });

  it("captures absent-before create authority only under explicit recovery authority", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const ledgerRoot = createLedgerRoot();

    const result = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, addPatch("src/new.ts", "ready")),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: authority.createFileExclusive,
      recoveryAuthority: {
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-create",
      },
    });

    expect(result.status).toBe("created");
    expect(result.recoveryAuthorityCapture?.status).toBe("captured");
    const record = result.recoveryAuthorityCapture?.records[0];
    expect(record).toEqual(
      expect.objectContaining({
        workspaceRelativePath: "src/new.ts",
        operationKind: "create",
        beforeState: "absent",
        expectedCurrentState: "exists",
      }),
    );
    expect(record?.beforeContentRef).toBeUndefined();
    expect(await readRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-create",
      recordId: "create-src-new.ts",
    })).toEqual(record);
  });

  it("blocks an existing target without overwriting or reporting changed files", async () => {
    const fixture = createFixture();
    fs.writeFileSync(path.join(fixture.workspaceRoot, "src", "new.ts"), "old\n");
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, addPatch("src/new.ts", "ready")),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: () => {
        throw new Error("writer must stay unreachable for collisions");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("workspace-boundary");
    expect(result.failures[0]?.code).toBe("patch-add-file-target-exists");
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks missing parent directories without creating them", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, addPatch("missing/new.ts", "ready")),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: () => {
        throw new Error("writer must stay unreachable for missing parents");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("workspace-boundary");
    expect(result.failures[0]?.code).toBe("patch-add-file-parent-missing");
    expectNoBlockedWriteLeak(result);
    expect(fs.existsSync(path.join(fixture.workspaceRoot, "missing"))).toBe(false);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks outside-workspace targets before writer invocation", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, addPatch("../outside.ts", "ready")),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: () => {
        throw new Error("writer must stay unreachable outside workspace");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("workspace-boundary");
    expect(result.failures[0]?.code).toBe("patch-verify-path-outside-workspace");
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks parent symlink traversal before writer invocation", async () => {
    const fixture = createFixture();
    const outsideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "single-file-create-outside-"),
    );
    tempRoots.push(outsideRoot);
    fs.symlinkSync(outsideRoot, path.join(fixture.workspaceRoot, "linked"));
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, addPatch("linked/new.ts", "ready")),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: () => {
        throw new Error("writer must stay unreachable through symlink parent");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("workspace-boundary");
    expect(result.failures[0]?.code).toBe("patch-apply-plan-not-verified");
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    expect(fs.existsSync(path.join(outsideRoot, "new.ts"))).toBe(false);
  });

  it("blocks multi Add File patches without writer invocation", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const multiAdd = [
      "*** Begin Patch",
      "*** Add File: src/a.ts",
      "+a",
      "*** Add File: src/b.ts",
      "+b",
      "*** End Patch",
    ].join("\n");

    const result = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, multiAdd),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: () => {
        throw new Error("writer must stay unreachable for multi-file add");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("unsupported-operation");
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks mixed Add and Update patches without writer invocation", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const mixed = [
      "*** Begin Patch",
      "*** Add File: src/new.ts",
      "+ready",
      "*** Update File: src/app.ts",
      "@@",
      "-draft",
      "+ready",
      "*** End Patch",
    ].join("\n");

    const result = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, mixed),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: () => {
        throw new Error("writer must stay unreachable for mixed patches");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("unsupported-operation");
    expectNoBlockedWriteLeak(result);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("does not report changed files when post-write verification fails", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, addPatch("src/new.ts", "ready")),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: (relativePath) => {
        authority.createFileExclusive(relativePath, "wrong");
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("post-write-verification");
    expect(result.workspaceWriterInvoked).toBe(true);
    expect(result.writerStarted).toBe(true);
    expect(result.writeEffect).toBe("unverified");
    expect(result.postWriteVerification).toBe("failed");
    expect(result.changedFiles).toEqual([]);
    expect(result.writeIntents).toEqual([]);
    expect(result.terminalClassification).toBe("stopped");
    expect(result.terminalSuccessAllowed).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/new.ts")).toBe("wrong");
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

function addPatch(relativePath: string, content: string): string {
  return [
    "*** Begin Patch",
    `*** Add File: ${relativePath}`,
    ...content.split("\n").map((line) => `+${line}`),
    "*** End Patch",
  ].join("\n");
}

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-workspace-create-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "app.ts"), "draft\n", "utf8");
  fs.writeFileSync(path.join(workspaceRoot, "LOCKED.md"), "do not modify\n", "utf8");
  return { workspaceRoot };
}

function createLedgerRoot(): string {
  const ledgerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "recovery-ledger-"));
  tempRoots.push(ledgerRoot);
  return ledgerRoot;
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
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
      if (entry.isSymbolicLink()) {
        result[path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/")] =
          `symlink:${fs.readlinkSync(absolutePath)}`;
        continue;
      }
      result[path.relative(workspaceRoot, absolutePath).replace(/\\/g, "/")] =
        fs.readFileSync(absolutePath, "utf8");
    }
  };
  visit(workspaceRoot);
  return result;
}

function expectNoBlockedWriteLeak(
  result: Extract<
    Awaited<ReturnType<typeof runWorkspaceCreateRoute>>,
    { status: "blocked" }
  >,
): void {
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.workspaceWriterInvoked).toBe(false);
  expect(result.writerTarget).toBe("none");
  expect(result.selectedWorkspaceWrite).toBe(false);
  expect(result.writerStarted).toBe(false);
  expect(result.writeEffect).toBe("none");
  expect(result.writeFailureState.failurePhase).toBe("before-writer");
  expect(result.appliedPatchRecord).toBe(false);
  expect(result.terminalClassification).toBe("stopped");
  expect(result.terminalSuccessAllowed).toBe(false);
  expect(result.mutationSuccessClaimAllowed).toBe(false);
  expect(result.evidence).toEqual(
    expect.arrayContaining([
      "apply-patch-workspace-create-route:changed-files-empty",
      "apply-patch-workspace-create-route:write-intents-empty",
      "apply-patch-workspace-create-route:no-writer-invoked",
      "apply-patch-workspace-create-route:no-success-claim",
    ]),
  );
}
