import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureRecoveryAuthorityRecord } from "./recoveryAuthorityStore.js";
import { restoreRecoveryAuthorityRecord } from "./restorePrimitive.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("restore primitive", () => {
  it("restores update records when current-content guard matches", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "after\n", "utf8");
    await captureRecord({
      ledgerRoot,
      recordId: "update-a",
      workspaceRelativePath: "src/a.ts",
      operationKind: "update",
      beforeState: "exists",
      beforeContent: "before\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
    });

    const result = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-restore",
      recordId: "update-a",
      workspaceRoot,
      workspaceRelativePath: "src/a.ts",
    });

    expect(result.restored).toBe(true);
    expect(result.rollbackAtomicityClaim).toBe(false);
    expect(fs.readFileSync(path.join(workspaceRoot, "src", "a.ts"), "utf8")).toBe(
      "before\n",
    );
  });

  it("blocks restore when current content differs from the expected hash", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "hidden-user-edit\n", "utf8");
    await captureRecord({
      ledgerRoot,
      recordId: "update-a",
      workspaceRelativePath: "src/a.ts",
      operationKind: "update",
      beforeState: "exists",
      beforeContent: "before\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
    });

    const result = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-restore",
      recordId: "update-a",
      workspaceRoot,
      workspaceRelativePath: "src/a.ts",
    });

    expect(result.restored).toBe(false);
    expect(result.blockedReason).toBe("current-content-hash-mismatch");
    expect(fs.readFileSync(path.join(workspaceRoot, "src", "a.ts"), "utf8")).toBe(
      "hidden-user-edit\n",
    );
  });

  it("restores deleted files when current state is still absent", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    await captureRecord({
      ledgerRoot,
      recordId: "delete-a",
      workspaceRelativePath: "src/a.ts",
      operationKind: "delete",
      beforeState: "exists",
      beforeContent: "before-delete\n",
      expectedCurrentState: "absent",
    });

    const result = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-restore",
      recordId: "delete-a",
      workspaceRoot,
      workspaceRelativePath: "src/a.ts",
    });

    expect(result.restored).toBe(true);
    expect(fs.readFileSync(path.join(workspaceRoot, "src", "a.ts"), "utf8")).toBe(
      "before-delete\n",
    );
  });

  it("removes created files only when the current-content guard passes", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    fs.writeFileSync(path.join(workspaceRoot, "src", "new.ts"), "created\n", "utf8");
    await captureRecord({
      ledgerRoot,
      recordId: "create-new",
      workspaceRelativePath: "src/new.ts",
      operationKind: "create",
      beforeState: "absent",
      expectedCurrentState: "exists",
      expectedCurrentContent: "created\n",
    });

    const result = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-restore",
      recordId: "create-new",
      workspaceRoot,
      workspaceRelativePath: "src/new.ts",
    });

    expect(result.restored).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, "src", "new.ts"))).toBe(false);
  });

  it("rejects path mismatch and traversal without restore", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    await captureRecord({
      ledgerRoot,
      recordId: "update-a",
      workspaceRelativePath: "src/a.ts",
      operationKind: "update",
      beforeState: "exists",
      beforeContent: "before\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
    });

    const mismatch = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-restore",
      recordId: "update-a",
      workspaceRoot,
      workspaceRelativePath: "src/b.ts",
    });
    expect(mismatch.restored).toBe(false);
    expect(mismatch.blockedReason).toBe("record-path-mismatch");

    const traversal = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-restore",
      recordId: "update-a",
      workspaceRoot,
      workspaceRelativePath: "../outside.ts",
    });
    expect(traversal.restored).toBe(false);
    expect(traversal.blockedReason).toBe("invalid-workspace-relative-path");
  });
});

function createFixture(): {
  readonly ledgerRoot: string;
  readonly workspaceRoot: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "restore-primitive-"));
  tempRoots.push(root);
  const ledgerRoot = path.join(root, "ledger");
  const workspaceRoot = path.join(root, "workspace");
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  return { ledgerRoot, workspaceRoot };
}

async function captureRecord(
  input: Parameters<typeof captureRecoveryAuthorityRecord>[0],
): Promise<void> {
  const result = await captureRecoveryAuthorityRecord({
    ...input,
    mode: "non-default",
    authorityId: "route-restore",
  });
  expect(result.status).toBe("captured");
}
