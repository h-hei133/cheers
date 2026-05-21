import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureRecoveryAuthorityRecord } from "./patchRecovery/recoveryAuthorityStore.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";
import { buildEditRecoveryPlan } from "./editRecoveryPlan.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("editRecoveryPlan", () => {
  it("creates a single-file rollback plan from an explicit snapshot id and target", async () => {
    const fixture = createFixture();
    await captureSnapshot(fixture);
    fs.writeFileSync(path.join(fixture.workspaceRoot, "src/app.ts"), "status: ready\n");
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const plan = await buildEditRecoveryPlan({
      mode: "single-file",
      ledgerRoot: fixture.ledgerRoot,
      workspaceRoot: fixture.workspaceRoot,
      requestedTargets: [
        {
          snapshotId: "authority-recovery:update-src-app.ts",
          targetPath: "src/app.ts",
        },
      ],
      validateWriteTarget: authority.validateWriteTarget,
    });

    expect(plan.status).toBe("ready");
    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]?.verificationRequirement).toBe(
      "post-rollback-verification",
    );
    expect(plan.evidence).toEqual(
      expect.arrayContaining([
        "edit-recovery-plan:created",
        "edit-recovery-plan:mutation-authority:not-granted",
        "edit-recovery-plan:no-automatic-rollback",
        "edit-recovery-plan:raw-content-excluded",
      ]),
    );
    expect(JSON.stringify(plan)).not.toContain("status: draft");
  });

  it("blocks missing snapshots and stale targets before rollback mutation", async () => {
    const fixture = createFixture();
    await captureSnapshot(fixture);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const missing = await buildEditRecoveryPlan({
      mode: "single-file",
      ledgerRoot: fixture.ledgerRoot,
      workspaceRoot: fixture.workspaceRoot,
      requestedTargets: [
        {
          snapshotId: "authority-recovery:missing",
          targetPath: "src/app.ts",
        },
      ],
      validateWriteTarget: authority.validateWriteTarget,
    });
    expect(missing.status).toBe("blocked");
    expect(missing.blocker).toBe("missing-snapshot");

    fs.writeFileSync(path.join(fixture.workspaceRoot, "src/app.ts"), "changed elsewhere\n");
    const stale = await buildEditRecoveryPlan({
      mode: "single-file",
      ledgerRoot: fixture.ledgerRoot,
      workspaceRoot: fixture.workspaceRoot,
      requestedTargets: [
        {
          snapshotId: "authority-recovery:update-src-app.ts",
          targetPath: "src/app.ts",
        },
      ],
      validateWriteTarget: authority.validateWriteTarget,
    });
    expect(stale.status).toBe("blocked");
    expect(stale.blocker).toBe("stale-target");
    expect(stale.evidence).toContain("edit-recovery-plan:rollback:not-run");
    expect(fs.readFileSync(path.join(fixture.workspaceRoot, "src/app.ts"), "utf8")).toBe(
      "changed elsewhere\n",
    );
  });

  it("blocks a rollback request without an explicit target before mutation", async () => {
    const fixture = createFixture();
    await captureSnapshot(fixture);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const plan = await buildEditRecoveryPlan({
      mode: "single-file",
      ledgerRoot: fixture.ledgerRoot,
      workspaceRoot: fixture.workspaceRoot,
      requestedTargets: [
        {
          snapshotId: "authority-recovery:update-src-app.ts",
        },
      ],
      validateWriteTarget: authority.validateWriteTarget,
    });

    expect(plan.status).toBe("blocked");
    expect(plan.blocker).toBe("missing-target");
    expect(plan.evidence).toContain("edit-recovery-plan:rollback:not-run");
    expect(fs.readFileSync(path.join(fixture.workspaceRoot, "src/app.ts"), "utf8")).toBe(
      "status: draft\n",
    );
  });
});

function createFixture(): {
  readonly workspaceRoot: string;
  readonly ledgerRoot: string;
} {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "coding-agents-edit-recovery-plan-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src/app.ts"), "status: draft\n");
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
    authorityId: "authority-recovery",
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
