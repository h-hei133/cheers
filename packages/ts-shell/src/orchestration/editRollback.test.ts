import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureRecoveryAuthorityRecord } from "./patchRecovery/recoveryAuthorityStore.js";
import {
  applyExplicitSingleFileRollback,
  projectSingleFileRollbackPlan,
} from "./editRollback.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("editRollback", () => {
  it("projects a dry-run rollback plan for a known single-file snapshot", async () => {
    const fixture = createFixture();
    await captureSnapshot(fixture);
    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "app.ts"),
      "status: ready\n",
      "utf8",
    );

    const plan = await projectSingleFileRollbackPlan({
      ledgerRoot: fixture.ledgerRoot,
      authorityId: "authority-rollback",
      recordId: "update-src-app.ts",
      workspaceRoot: fixture.workspaceRoot,
      targetPath: "src/app.ts",
    });

    expect(plan).toMatchObject({
      status: "rollback-plan-ready",
      snapshotId: "authority-rollback:update-src-app.ts",
      canApplyExplicitRollback: true,
      staleTargetState: "current-target-matches-snapshot-expectation",
      automaticRollback: false,
      atomicRollback: false,
      restoreMode: "dry-run",
    });
    expect(plan.evidence).toEqual(
      expect.arrayContaining([
        "edit-rollback-plan:single-file-only",
        "edit-rollback-plan:no-automatic-rollback",
        "edit-rollback-plan:no-raw-content",
      ]),
    );
  });

  it("offers an explicit single-file rollback seam guarded by current content", async () => {
    const fixture = createFixture();
    await captureSnapshot(fixture);
    fs.writeFileSync(
      path.join(fixture.workspaceRoot, "src", "app.ts"),
      "status: ready\n",
      "utf8",
    );

    const result = await applyExplicitSingleFileRollback({
      ledgerRoot: fixture.ledgerRoot,
      authorityId: "authority-rollback",
      recordId: "update-src-app.ts",
      workspaceRoot: fixture.workspaceRoot,
      targetPath: "src/app.ts",
    });

    expect(result.restored).toBe(true);
    expect(result.rollbackAtomicityClaim).toBe(false);
    expect(fs.readFileSync(path.join(fixture.workspaceRoot, "src", "app.ts"), "utf8")).toBe(
      "status: draft\n",
    );
    expect(JSON.stringify(result)).not.toContain("status: draft");
  });
});

function createFixture(): {
  readonly workspaceRoot: string;
  readonly ledgerRoot: string;
} {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "coding-agents-edit-rollback-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "app.ts"), "status: draft\n");
  return {
    workspaceRoot,
    ledgerRoot: path.join(workspaceRoot, ".sisyphus", "edit-snapshots"),
  };
}

async function captureSnapshot(input: {
  readonly workspaceRoot: string;
  readonly ledgerRoot: string;
}): Promise<void> {
  const result = await captureRecoveryAuthorityRecord({
    mode: "non-default",
    ledgerRoot: input.ledgerRoot,
    authorityId: "authority-rollback",
    recordId: "update-src-app.ts",
    workspaceRelativePath: "src/app.ts",
    operationKind: "update",
    beforeState: "exists",
    beforeContent: "status: draft\n",
    expectedCurrentState: "exists",
    expectedCurrentContent: "status: ready\n",
    createdAt: "2026-05-21T00:00:00.000Z",
  });
  expect(result.status).toBe("captured");
}
