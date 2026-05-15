import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureRecoveryAuthorityRecord } from "./recoveryAuthorityStore.js";
import { previewRecoveryAuthorityRestore } from "./restorePreview.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("restore preview", () => {
  it("previews an eligible update record without writing", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "after\n", "utf8");
    await captureRecord({
      ledgerRoot,
      recordId: "update-a",
      workspaceRelativePath: "src/a.ts",
      beforeState: "exists",
      beforeContent: "before\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
    });

    const preview = await previewRecoveryAuthorityRestore({
      ledgerRoot,
      authorityId: "route-preview",
      workspaceRoot,
      recordIds: ["update-a"],
    });

    expect(preview.canAttemptExplicitRestore).toBe(true);
    expect(preview.restorableFiles).toEqual([
      expect.objectContaining({
        recordId: "update-a",
        workspaceRelativePath: "src/a.ts",
      }),
    ]);
    expect(fs.readFileSync(path.join(workspaceRoot, "src", "a.ts"), "utf8")).toBe(
      "after\n",
    );
  });

  it("blocks hidden user edits with current-content mismatch", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "a.ts"),
      "hidden-user-edit\n",
      "utf8",
    );
    await captureRecord({
      ledgerRoot,
      recordId: "update-a",
      workspaceRelativePath: "src/a.ts",
      beforeState: "exists",
      beforeContent: "before\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
    });

    const preview = await previewRecoveryAuthorityRestore({
      ledgerRoot,
      authorityId: "route-preview",
      workspaceRoot,
      recordIds: ["update-a"],
    });

    expect(preview.canAttemptExplicitRestore).toBe(false);
    expect(preview.currentContentMismatches).toEqual(["src/a.ts"]);
    expect(preview.blockedFiles[0]?.blockedReason).toBe(
      "current-content-hash-mismatch",
    );
  });

  it("blocks missing content blobs and missing records", async () => {
    const { ledgerRoot, workspaceRoot } = createFixture();
    fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "after\n", "utf8");
    await captureRecord({
      ledgerRoot,
      recordId: "update-a",
      workspaceRelativePath: "src/a.ts",
      beforeState: "exists",
      beforeContent: "before\n",
      expectedCurrentState: "exists",
      expectedCurrentContent: "after\n",
    });
    fs.rmSync(path.join(ledgerRoot, "route-preview", "blobs"), {
      recursive: true,
      force: true,
    });

    const preview = await previewRecoveryAuthorityRestore({
      ledgerRoot,
      authorityId: "route-preview",
      workspaceRoot,
      recordIds: ["update-a", "missing"],
    });

    expect(preview.blockedFiles[0]?.blockedReason).toBe(
      "original-content-missing",
    );
    expect(preview.missingRecords).toEqual(["missing"]);
    expect(preview.canAttemptExplicitRestore).toBe(false);
  });
});

function createFixture(): {
  readonly ledgerRoot: string;
  readonly workspaceRoot: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "restore-preview-"));
  tempRoots.push(root);
  const ledgerRoot = path.join(root, "ledger");
  const workspaceRoot = path.join(root, "workspace");
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  return { ledgerRoot, workspaceRoot };
}

async function captureRecord(input: {
  readonly ledgerRoot: string;
  readonly recordId: string;
  readonly workspaceRelativePath: string;
  readonly beforeState: "exists" | "absent";
  readonly beforeContent?: string;
  readonly expectedCurrentState: "exists" | "absent";
  readonly expectedCurrentContent?: string;
}): Promise<void> {
  const result = await captureRecoveryAuthorityRecord({
    mode: "non-default",
    authorityId: "route-preview",
    operationKind: "update",
    createdAt: "2026-05-15T00:00:00.000Z",
    ...input,
  });
  expect(result.status).toBe("captured");
}
