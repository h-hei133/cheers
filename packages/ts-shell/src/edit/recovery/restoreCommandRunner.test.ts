import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureRecoveryAuthorityRecord } from "./recoveryAuthorityStore.js";
import { runRestoreCommand } from "./restoreCommandRunner.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("restore command runner", () => {
  it("previews without writing workspace files", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    const filePath = path.join(workspaceRoot, "src", "a.ts");
    fs.writeFileSync(filePath, "after\n", "utf8");
    await captureUpdate({ ledgerRoot });

    const result = await runRestoreCommand({
      mode: "preview",
      ledgerRoot,
      workspaceRoot,
      authorityId: "route-command",
      recordSelection: { kind: "records", recordIds: ["update-a"] },
    });

    expect(result.executed).toBe(false);
    expect(result.restorableFiles.map((file) => file.workspaceRelativePath)).toEqual([
      "src/a.ts",
    ]);
    expect(fs.readFileSync(filePath, "utf8")).toBe("after\n");
    expect(result.evidence).toContain("restore-command-runner:provider-not-invoked");
  });

  it("executes only with explicit intent and restores eligible records", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    const filePath = path.join(workspaceRoot, "src", "a.ts");
    fs.writeFileSync(filePath, "after\n", "utf8");
    await captureUpdate({ ledgerRoot });

    const result = await runRestoreCommand({
      mode: "execute",
      ledgerRoot,
      workspaceRoot,
      authorityId: "route-command",
      recordSelection: { kind: "all" },
      requireExplicitExecute: true,
    });

    expect(result.executed).toBe(true);
    expect(result.restoredFiles).toEqual(["src/a.ts"]);
    expect(result.blockedFiles).toEqual([]);
    expect(fs.readFileSync(filePath, "utf8")).toBe("before\n");
    expect(result.automaticRecovery).toBe(false);
    expect(result.rollbackAtomicityClaim).toBe(false);
  });

  it("blocks current-content mismatch without restoring", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    const filePath = path.join(workspaceRoot, "src", "a.ts");
    fs.writeFileSync(filePath, "hidden-user-edit\n", "utf8");
    await captureUpdate({ ledgerRoot });

    const result = await runRestoreCommand({
      mode: "execute",
      ledgerRoot,
      workspaceRoot,
      authorityId: "route-command",
      recordSelection: { kind: "records", recordIds: ["update-a"] },
      requireExplicitExecute: true,
    });

    expect(result.executed).toBe(false);
    expect(result.blockedFiles[0]?.blockedReason).toBe(
      "current-content-hash-mismatch",
    );
    expect(fs.readFileSync(filePath, "utf8")).toBe("hidden-user-edit\n");
  });

  it("reports missing records and missing content blobs separately from restored files", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "after\n", "utf8");
    await captureUpdate({ ledgerRoot });
    fs.rmSync(path.join(ledgerRoot, "route-command", "blobs"), {
      recursive: true,
      force: true,
    });

    const result = await runRestoreCommand({
      mode: "execute",
      ledgerRoot,
      workspaceRoot,
      authorityId: "route-command",
      recordSelection: { kind: "records", recordIds: ["update-a", "missing"] },
      requireExplicitExecute: true,
    });

    expect(result.executed).toBe(false);
    expect(result.restoredFiles).toEqual([]);
    expect(result.blockedFiles[0]?.blockedReason).toBe("original-content-missing");
    expect(result.missingRecords).toEqual(["missing"]);
  });
});

function createFixture(): {
  readonly ledgerRoot: string;
  readonly workspaceRoot: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "restore-command-"));
  tempRoots.push(root);
  const ledgerRoot = path.join(root, "ledger");
  const workspaceRoot = path.join(root, "workspace");
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  return { ledgerRoot, workspaceRoot };
}

async function captureUpdate(input: { readonly ledgerRoot: string }): Promise<void> {
  const result = await captureRecoveryAuthorityRecord({
    mode: "non-default",
    ledgerRoot: input.ledgerRoot,
    authorityId: "route-command",
    recordId: "update-a",
    workspaceRelativePath: "src/a.ts",
    operationKind: "update",
    beforeState: "exists",
    beforeContent: "before\n",
    expectedCurrentState: "exists",
    expectedCurrentContent: "after\n",
    createdAt: "2026-05-15T00:00:00.000Z",
  });
  expect(result.status).toBe("captured");
}
