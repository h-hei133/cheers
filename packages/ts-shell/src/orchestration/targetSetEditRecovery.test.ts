import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDiscoveryEditManifest } from "./discoveryEditManifest.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";
import { runTargetSetEditRoute } from "./targetSetEditRoute.js";
import { buildTargetSetPartialRecoveryPlan } from "./targetSetEditRecovery.js";
import { runEditRecoveryApplyRoute } from "./editRecoveryApply.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("targetSetEditRecovery", () => {
  it("plans and applies an explicit subset rollback for target-set partial failures", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runTargetSetEditRoute({
      workspaceRoot: fixture.workspaceRoot,
      manifest: buildManifest(fixture.workspaceRoot, ["src/a.ts", "src/b.ts"]),
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
      mapping: {
        oldText: "status: draft",
        newText: "status: ready",
        source: "old-new-fenced-blocks",
      },
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: (relativePath, content) => {
        if (relativePath === "src/b.ts") {
          throw new Error("fixture second write failed");
        }
        authority.writeFile(relativePath, content);
      },
    });
    expect(route.status).toBe("partial-failure");
    expect(route.changedFiles).toEqual(["src/a.ts"]);

    const plan = await buildTargetSetPartialRecoveryPlan({
      route,
      ledgerRoot: path.join(fixture.workspaceRoot, ".sisyphus", "edit-snapshots"),
      workspaceRoot: fixture.workspaceRoot,
      validateWriteTarget: authority.validateWriteTarget,
    });
    expect(plan.status).toBe("ready");
    expect(plan.mode).toBe("target-set-subset");
    expect(plan.targets.map((target) => target.targetPath)).toEqual(["src/a.ts"]);

    const apply = await runEditRecoveryApplyRoute({
      plan,
      ledgerRoot: path.join(fixture.workspaceRoot, ".sisyphus", "edit-snapshots"),
      workspaceRoot: fixture.workspaceRoot,
      explicitRollbackConfirmation: true,
      confirmedSnapshotIds: plan.targets.map((target) => target.snapshotId),
      validateWriteTarget: authority.validateWriteTarget,
      readVerifiedFile: authority.readVerifiedFile,
    });

    expect(apply.status).toBe("rollback-success");
    expect(apply.restoredFiles).toEqual(["src/a.ts"]);
    expect(apply.evidence).toEqual(
      expect.arrayContaining([
        "edit-recovery-outcome:edit-rollback-success",
        "edit-recovery-apply:no-automatic-rollback",
        "edit-recovery-apply:no-atomic-rollback",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe(
      "title\nstatus: draft\nfooter\n",
    );
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe(
      "title\nstatus: draft\nfooter\n",
    );
  });
});

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "coding-agents-target-set-recovery-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src/a.ts"),
    "title\nstatus: draft\nfooter\n",
  );
  fs.writeFileSync(
    path.join(workspaceRoot, "src/b.ts"),
    "title\nstatus: draft\nfooter\n",
  );
  return { workspaceRoot };
}

function buildManifest(workspaceRoot: string, targets: readonly string[]) {
  return buildDiscoveryEditManifest({
    workspaceRoot,
    maxCandidates: 5,
    requiredConfirmationStatus: "confirmed-target-set",
    candidates: targets.map((target) => ({ path: target, matchCount: 1 })),
  });
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}
