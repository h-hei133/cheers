import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureRecoveryAuthorityRecord } from "./patchRecovery/recoveryAuthorityStore.js";
import { createWorkspaceWriteAuthority } from "../edit/authority/workspace.js";
import { buildEditRecoveryPlan } from "./editRecoveryPlan.js";
import { runEditRecoveryApplyRoute } from "./editRecoveryApply.js";
import { buildEditRecoveryApplyRouteResult } from "./editRecoveryResult.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("editRecoveryApply", () => {
  it("applies an explicit single-file rollback and projects a safe result", async () => {
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

    const route = await runEditRecoveryApplyRoute({
      plan,
      ledgerRoot: fixture.ledgerRoot,
      workspaceRoot: fixture.workspaceRoot,
      explicitRollbackConfirmation: true,
      confirmedSnapshotIds: ["authority-recovery:update-src-app.ts"],
      validateWriteTarget: authority.validateWriteTarget,
      readVerifiedFile: authority.readVerifiedFile,
    });

    expect(route.status).toBe("rollback-success");
    expect(route.restoredFiles).toEqual(["src/app.ts"]);
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "edit-recovery-outcome:edit-rollback-success",
        "edit-recovery-apply:explicit-confirmation",
        "edit-recovery-apply:rollback-applied",
        "edit-recovery-apply:raw-content-excluded",
      ]),
    );
    expect(fs.readFileSync(path.join(fixture.workspaceRoot, "src/app.ts"), "utf8")).toBe(
      "status: draft\n",
    );

    const result = buildEditRecoveryApplyRouteResult({
      sessionId: "session-recovery-apply",
      prompt: "explicit rollback apply",
      route,
    });
    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.repair.status).toBe("recovered");
    expect(result.codingResult?.continuation.evidence).toEqual(
      expect.arrayContaining([
        "edit-recovery-result:continuation-safe",
        "edit-recovery-result:raw-content-excluded",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("status: draft");
  });

  it("stops rollback apply without explicit confirmation before mutation", async () => {
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

    const route = await runEditRecoveryApplyRoute({
      plan,
      ledgerRoot: fixture.ledgerRoot,
      workspaceRoot: fixture.workspaceRoot,
      explicitRollbackConfirmation: false,
      confirmedSnapshotIds: ["authority-recovery:update-src-app.ts"],
      validateWriteTarget: authority.validateWriteTarget,
      readVerifiedFile: authority.readVerifiedFile,
    });

    expect(route.status).toBe("rollback-stopped");
    expect(route.restoredFiles).toEqual([]);
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "edit-recovery-outcome:edit-rollback-stopped-confirmation-required",
        "edit-recovery-apply:rollback:not-run",
        "edit-recovery-apply:no-writer-invoked",
      ]),
    );
    expect(fs.readFileSync(path.join(fixture.workspaceRoot, "src/app.ts"), "utf8")).toBe(
      "status: ready\n",
    );
  });

  it("reruns workspace authority immediately before rollback apply", async () => {
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
    fs.rmSync(path.join(fixture.workspaceRoot, "src/app.ts"));

    const route = await runEditRecoveryApplyRoute({
      plan,
      ledgerRoot: fixture.ledgerRoot,
      workspaceRoot: fixture.workspaceRoot,
      explicitRollbackConfirmation: true,
      confirmedSnapshotIds: ["authority-recovery:update-src-app.ts"],
      validateWriteTarget: authority.validateWriteTarget,
      readVerifiedFile: authority.readVerifiedFile,
    });

    expect(route.status).toBe("rollback-stopped");
    expect(route.restoredFiles).toEqual([]);
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "edit-recovery-apply:final-workspace-authority-blocked",
        "edit-recovery-apply:rollback:not-run",
      ]),
    );
    expect(fs.existsSync(path.join(fixture.workspaceRoot, "src/app.ts"))).toBe(false);
  });
});

function createFixture(): {
  readonly workspaceRoot: string;
  readonly ledgerRoot: string;
} {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "coding-agents-edit-recovery-apply-"),
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
