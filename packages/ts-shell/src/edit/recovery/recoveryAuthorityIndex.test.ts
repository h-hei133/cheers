import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureRecoveryAuthorityRecord } from "./recoveryAuthorityStore.js";
import {
  listRecoveryAuthorityNamespaces,
  listRecoveryAuthorityRecords,
} from "./recoveryAuthorityIndex.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("recovery authority index", () => {
  it("lists namespaces and metadata records without raw content", async () => {
    const ledgerRoot = tempRoot("recovery-authority-index-");
    await captureRecord({
      ledgerRoot,
      authorityId: "route-index",
      recordId: "record-1",
      workspaceRelativePath: "src/a.ts",
      beforeContent: "secret-original\n",
      expectedCurrentContent: "after\n",
    });

    const namespaces = await listRecoveryAuthorityNamespaces({ ledgerRoot });
    expect(namespaces.status).toBe("listed");
    expect(namespaces.authorityIds).toEqual(["route-index"]);

    const records = await listRecoveryAuthorityRecords({
      ledgerRoot,
      authorityId: "route-index",
    });
    expect(records.status).toBe("listed");
    expect(records.records).toEqual([
      expect.objectContaining({
        recordId: "record-1",
        workspaceRelativePath: "src/a.ts",
        operationKind: "update",
        beforeState: "exists",
        expectedCurrentState: "exists",
        hasContentBlob: true,
        schemaVersion: 1,
      }),
    ]);
    expect(JSON.stringify(records.records)).not.toContain("secret-original");
  });

  it("reports missing records and missing namespaces as diagnostics", async () => {
    const ledgerRoot = tempRoot("recovery-authority-index-missing-");
    await captureRecord({
      ledgerRoot,
      authorityId: "route-index",
      recordId: "record-1",
      workspaceRelativePath: "src/a.ts",
      beforeContent: "before\n",
      expectedCurrentContent: "after\n",
    });

    const records = await listRecoveryAuthorityRecords({
      ledgerRoot,
      authorityId: "route-index",
      recordIds: ["record-1", "missing"],
    });
    expect(records.status).toBe("listed");
    expect(records.missingRecords).toEqual(["missing"]);

    const missingNamespace = await listRecoveryAuthorityRecords({
      ledgerRoot,
      authorityId: "missing-route",
    });
    expect(missingNamespace.status).toBe("blocked");
    expect(missingNamespace.blockedReason).toBe("namespace-not-found");
  });

  it("rejects invalid authority and record ids", async () => {
    const ledgerRoot = tempRoot("recovery-authority-index-invalid-");

    const invalidAuthority = await listRecoveryAuthorityRecords({
      ledgerRoot,
      authorityId: "../route",
    });
    expect(invalidAuthority.status).toBe("blocked");
    expect(invalidAuthority.blockedReason).toBe("invalid-id");

    await captureRecord({
      ledgerRoot,
      authorityId: "route-index",
      recordId: "record-1",
      workspaceRelativePath: "src/a.ts",
      beforeContent: "before\n",
      expectedCurrentContent: "after\n",
    });
    const invalidRecord = await listRecoveryAuthorityRecords({
      ledgerRoot,
      authorityId: "route-index",
      recordIds: ["../record"],
    });
    expect(invalidRecord.status).toBe("blocked");
    expect(invalidRecord.blockedReason).toBe("invalid-id");
  });
});

async function captureRecord(input: {
  readonly ledgerRoot: string;
  readonly authorityId: string;
  readonly recordId: string;
  readonly workspaceRelativePath: string;
  readonly beforeContent: string;
  readonly expectedCurrentContent: string;
}): Promise<void> {
  const result = await captureRecoveryAuthorityRecord({
    mode: "non-default",
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
    recordId: input.recordId,
    workspaceRelativePath: input.workspaceRelativePath,
    operationKind: "update",
    beforeState: "exists",
    beforeContent: input.beforeContent,
    expectedCurrentState: "exists",
    expectedCurrentContent: input.expectedCurrentContent,
    createdAt: "2026-05-15T00:00:00.000Z",
  });
  expect(result.status).toBe("captured");
}

function tempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}
