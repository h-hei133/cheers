import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureRecoveryAuthorityRecord,
  cleanupRecoveryAuthorityRecord,
  hashContent,
  purgeRecoveryAuthority,
  readRecoveryAuthorityRecord,
} from "./recoveryAuthorityStore.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("recovery authority store", () => {
  it("keeps disabled mode diagnostic-only without file IO", async () => {
    const ledgerRoot = tempRoot("recovery-authority-disabled-");

    const result = await captureRecoveryAuthorityRecord({
      mode: "disabled",
      ledgerRoot,
      authorityId: "route-disabled",
      recordId: "record-1",
      workspaceRelativePath: "src/a.ts",
      operationKind: "update",
      beforeState: "exists",
      beforeContent: "before\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
    });

    expect(result.status).toBe("disabled");
    expect(fs.existsSync(path.join(ledgerRoot, "route-disabled"))).toBe(false);
  });

  it("requires explicit non-default ledger root", async () => {
    const result = await captureRecoveryAuthorityRecord({
      mode: "non-default",
      authorityId: "route-missing-root",
      recordId: "record-1",
      workspaceRelativePath: "src/a.ts",
      operationKind: "update",
      beforeState: "exists",
      beforeContent: "before\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
    });

    expect(result.status).toBe("blocked");
    expect(result.blockedReason).toBe("ledger-root-required");
  });

  it("stores metadata manifest separately from original-content blob", async () => {
    const ledgerRoot = tempRoot("recovery-authority-store-");
    const result = await captureRecoveryAuthorityRecord({
      mode: "non-default",
      ledgerRoot,
      authorityId: "route-store",
      recordId: "record-1",
      workspaceRelativePath: "src/a.ts",
      operationKind: "update",
      beforeState: "exists",
      beforeContent: "secret-before-content\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
      createdAt: "2026-05-15T00:00:00.000Z",
    });

    expect(result.status).toBe("captured");
    const record = result.records[0];
    expect(record?.beforeContentHash).toBe(hashContent("secret-before-content\n"));
    expect(record?.workspaceRelativePath).toBe("src/a.ts");
    expect(record?.beforeContentRef).toMatch(/^blobs\/[a-f0-9]+\.content$/);

    const manifest = fs.readFileSync(
      path.join(ledgerRoot, "route-store", "records", "record-1.json"),
      "utf8",
    );
    expect(manifest).not.toContain("secret-before-content");
    expect(manifest).not.toContain(ledgerRoot);
    expect(manifest).not.toContain(path.join(ledgerRoot, "route-store"));

    const blob = fs.readFileSync(
      path.join(ledgerRoot, "route-store", record?.beforeContentRef ?? ""),
      "utf8",
    );
    expect(blob).toBe("secret-before-content\n");
  });

  it("cleans individual records and purges namespaces", async () => {
    const ledgerRoot = tempRoot("recovery-authority-cleanup-");
    await captureRecoveryAuthorityRecord({
      mode: "non-default",
      ledgerRoot,
      authorityId: "route-cleanup",
      recordId: "record-1",
      workspaceRelativePath: "src/a.ts",
      operationKind: "update",
      beforeState: "exists",
      beforeContent: "before\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
    });

    const cleanup = await cleanupRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-cleanup",
      recordId: "record-1",
    });
    expect(cleanup.cleaned).toBe(true);
    expect(
      fs.existsSync(path.join(ledgerRoot, "route-cleanup", "records", "record-1.json")),
    ).toBe(false);
    expect(await readRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "route-cleanup",
      recordId: "record-1",
    })).toBeUndefined();

    await captureRecoveryAuthorityRecord({
      mode: "non-default",
      ledgerRoot,
      authorityId: "route-cleanup",
      recordId: "record-2",
      workspaceRelativePath: "src/b.ts",
      operationKind: "update",
      beforeState: "exists",
      beforeContent: "before\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
    });
    const purge = await purgeRecoveryAuthority({
      ledgerRoot,
      authorityId: "route-cleanup",
    });
    expect(purge.cleaned).toBe(true);
    expect(fs.existsSync(path.join(ledgerRoot, "route-cleanup"))).toBe(false);
  });

  it("rejects absolute and traversal workspace-relative paths", async () => {
    const ledgerRoot = tempRoot("recovery-authority-boundary-");
    for (const workspaceRelativePath of ["/tmp/outside.ts", "../outside.ts"]) {
      const result = await captureRecoveryAuthorityRecord({
        mode: "non-default",
        ledgerRoot,
        authorityId: "route-boundary",
        recordId: workspaceRelativePath.startsWith("/") ? "absolute" : "traversal",
        workspaceRelativePath,
        operationKind: "update",
        beforeState: "exists",
        beforeContent: "before\n",
        expectedCurrentState: "exists",
        expectedCurrentContent: "after\n",
      });
      expect(result.status).toBe("blocked");
      expect(result.blockedReason).toBe("invalid-workspace-relative-path");
    }
  });
});

function tempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}
