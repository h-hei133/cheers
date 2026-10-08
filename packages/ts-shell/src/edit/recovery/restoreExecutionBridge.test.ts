import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRestoreCommandResult } from '../../core/commands/restoreCommandRuntime.js';
import { captureRecoveryAuthorityRecord } from "./recoveryAuthorityStore.js";
import { runExplicitRestoreBridge } from "./restoreExecutionBridge.js";

const tempRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("restore execution bridge", () => {
  it('reports an unknown writer outcome instead of asserting non-execution after publication', async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    const target = path.join(workspaceRoot, 'src', 'a.ts');
    fs.writeFileSync(target, 'after\n');
    await captureUpdate({ ledgerRoot, recordId: 'update-a' });
    const sync = fs.fsyncSync;
    vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
      if (fs.readFileSync(target, 'utf8') === 'before\n') throw new Error('flush failed after publication');
      return sync(fd);
    });
    const result = await runExplicitRestoreBridge({ mode: 'execute', ledgerRoot, workspaceRoot, authorityId: 'route-bridge', recordSelection: ['update-a'] });
    expect(result.outcome).toBe('unknown');
    expect(result.unknownFiles.map(file => file.workspaceRelativePath)).toEqual(['src/a.ts']);
    expect(fs.readFileSync(target, 'utf8')).toBe('before\n');
    const output = formatRestoreCommandResult({ ...result, restorableFiles: [] });
    expect(output).toContain('Restore — outcome unknown');
    expect(output).not.toContain('Executed: no');
  });
  it("preview mode does not write and reports no automatic recovery", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    const filePath = path.join(workspaceRoot, "src", "a.ts");
    fs.writeFileSync(filePath, "after\n", "utf8");
    await captureUpdate({ ledgerRoot, recordId: "update-a" });

    const result = await runExplicitRestoreBridge({
      mode: "preview",
      ledgerRoot,
      authorityId: "route-bridge",
      workspaceRoot,
      recordSelection: ["update-a"],
    });

    expect(result.executed).toBe(false);
    expect(result.skippedFiles).toHaveLength(1);
    expect(result.rollbackAtomicityClaim).toBe(false);
    expect(result.automaticRecovery).toBe(false);
    expect(fs.readFileSync(filePath, "utf8")).toBe("after\n");
  });

  it("execute mode restores eligible update, delete, and create records", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "after\n", "utf8");
    fs.writeFileSync(path.join(workspaceRoot, "src", "new.ts"), "created\n", "utf8");
    await captureUpdate({ ledgerRoot, recordId: "update-a" });
    await captureRecoveryAuthorityRecord({
      mode: "non-default",
      ledgerRoot,
      authorityId: "route-bridge",
      recordId: "delete-b",
      workspaceRelativePath: "src/b.ts",
      operationKind: "delete",
      beforeState: "exists",
      beforeContent: "before-delete\n",
      expectedCurrentState: "absent",
      createdAt: "2026-05-15T00:00:01.000Z",
    });
    await captureRecoveryAuthorityRecord({
      mode: "non-default",
      ledgerRoot,
      authorityId: "route-bridge",
      recordId: "create-new",
      workspaceRelativePath: "src/new.ts",
      operationKind: "create",
      beforeState: "absent",
      expectedCurrentState: "exists",
      expectedCurrentContent: "created\n",
      createdAt: "2026-05-15T00:00:02.000Z",
    });

    const result = await runExplicitRestoreBridge({
      mode: "execute",
      ledgerRoot,
      authorityId: "route-bridge",
      workspaceRoot,
      recordSelection: "all",
    });

    expect(result.executed).toBe(true);
    expect(result.restoredFiles).toEqual(["src/new.ts", "src/b.ts", "src/a.ts"]);
    expect(fs.existsSync(path.join(workspaceRoot, "src", "new.ts"))).toBe(false);
    expect(fs.readFileSync(path.join(workspaceRoot, "src", "b.ts"), "utf8")).toBe(
      "before-delete\n",
    );
    expect(fs.readFileSync(path.join(workspaceRoot, "src", "a.ts"), "utf8")).toBe(
      "before\n",
    );
    expect(result.rollbackAtomicityClaim).toBe(false);
    expect(result.automaticRecovery).toBe(false);
  });

  it("blocks current-content mismatches and preserves user edits", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    const filePath = path.join(workspaceRoot, "src", "a.ts");
    fs.writeFileSync(filePath, "hidden-user-edit\n", "utf8");
    await captureUpdate({ ledgerRoot, recordId: "update-a" });

    const result = await runExplicitRestoreBridge({
      mode: "execute",
      ledgerRoot,
      authorityId: "route-bridge",
      workspaceRoot,
      recordSelection: ["update-a"],
    });

    expect(result.executed).toBe(false);
    expect(result.blockedFiles[0]?.blockedReason).toBe(
      "current-content-hash-mismatch",
    );
    expect(fs.readFileSync(filePath, "utf8")).toBe("hidden-user-edit\n");
  });
});

function createFixture(): {
  readonly ledgerRoot: string;
  readonly workspaceRoot: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "restore-bridge-"));
  tempRoots.push(root);
  const ledgerRoot = path.join(root, "ledger");
  const workspaceRoot = path.join(root, "workspace");
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  return { ledgerRoot, workspaceRoot };
}

async function captureUpdate(input: {
  readonly ledgerRoot: string;
  readonly recordId: string;
}): Promise<void> {
  const result = await captureRecoveryAuthorityRecord({
    mode: "non-default",
    ledgerRoot: input.ledgerRoot,
    authorityId: "route-bridge",
    recordId: input.recordId,
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
