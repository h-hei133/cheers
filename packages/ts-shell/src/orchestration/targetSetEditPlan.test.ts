import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDiscoveryEditManifest } from "./discoveryEditManifest.js";
import { buildTargetSetEditPlan } from "./targetSetEditPlan.js";
import { createWorkspaceWriteAuthority } from "../edit/authority/workspace.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("targetSetEditPlan", () => {
  it("preflights an explicit confirmed target set before mutation authority", () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const manifest = buildManifest(fixture.workspaceRoot, ["src/a.ts", "src/b.ts"]);

    const plan = buildTargetSetEditPlan({
      manifest,
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
      mapping: mapping(),
      workspaceRoot: fixture.workspaceRoot,
      readFile: authority.readFile,
      validateWriteTarget: authority.validateWriteTarget,
    });

    expect(plan.status).toBe("ready");
    expect(plan.targetCount).toBe(2);
    expect(plan.evidence).toEqual(
      expect.arrayContaining([
        "target-set-edit-plan:preflight-all-before-mutation",
        "target-set-edit-plan:all-targets-preflighted",
        "target-set-edit-plan:mutation-authority:execution-route-only",
      ]),
    );
    expect(plan.evidence.join("\n")).not.toContain("status: ready");
    expect(plan.evidence.join("\n")).not.toContain("status: draft");
  });

  it("stops over max, duplicate, missing mapping, and non-manifest targets before mutation", () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const manifest = buildManifest(fixture.workspaceRoot, [
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
      "src/d.ts",
    ]);

    const overMax = buildTargetSetEditPlan({
      manifest,
      confirmedTargetSet: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"],
      mapping: mapping(),
      workspaceRoot: fixture.workspaceRoot,
      maxFiles: 3,
      readFile: authority.readFile,
      validateWriteTarget: authority.validateWriteTarget,
    });
    expect(overMax.status).toBe("blocked");
    expect(overMax.blocker).toBe("over-max-files");
    expect(overMax.evidence).toContain("target-set-edit-mutation:not-run");

    const duplicate = buildTargetSetEditPlan({
      manifest,
      confirmedTargetSet: ["src/a.ts", "src/a.ts"],
      mapping: mapping(),
      workspaceRoot: fixture.workspaceRoot,
      readFile: authority.readFile,
      validateWriteTarget: authority.validateWriteTarget,
    });
    expect(duplicate.status).toBe("blocked");
    expect(duplicate.blocker).toBe("duplicate-target");

    const missingMapping = buildTargetSetEditPlan({
      manifest,
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
      workspaceRoot: fixture.workspaceRoot,
      readFile: authority.readFile,
      validateWriteTarget: authority.validateWriteTarget,
    });
    expect(missingMapping.status).toBe("blocked");
    expect(missingMapping.blocker).toBe("missing-mapping");

    const notInManifest = buildTargetSetEditPlan({
      manifest,
      confirmedTargetSet: ["src/a.ts", "src/missing.ts"],
      mapping: mapping(),
      workspaceRoot: fixture.workspaceRoot,
      readFile: authority.readFile,
      validateWriteTarget: authority.validateWriteTarget,
    });
    expect(notInManifest.status).toBe("blocked");
    expect(notInManifest.blocker).toBe("target-not-in-manifest");
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe(
      "title\nstatus: draft\nfooter\n",
    );
  });

  it("stops a multiple match in any target before all mutations", () => {
    const fixture = createFixture({
      "src/a.ts": "title\nstatus: draft\nfooter\n",
      "src/b.ts": "status: draft\nstatus: draft\n",
    });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const manifest = buildManifest(fixture.workspaceRoot, ["src/a.ts", "src/b.ts"]);

    const plan = buildTargetSetEditPlan({
      manifest,
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
      mapping: mapping(),
      workspaceRoot: fixture.workspaceRoot,
      readFile: authority.readFile,
      validateWriteTarget: authority.validateWriteTarget,
    });

    expect(plan.status).toBe("blocked");
    expect(plan.blocker).toBe("multiple-matches");
    expect(plan.targetPath).toBe("src/b.ts");
    expect(plan.evidence).toEqual(
      expect.arrayContaining([
        "target-set-edit-preflight-stopped",
        "target-set-edit-mutation:not-run",
        "fenced-edit-plan:multiple-matches",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe(
      "title\nstatus: draft\nfooter\n",
    );
  });
});

function createFixture(
  files: Record<string, string> = {
    "src/a.ts": "title\nstatus: draft\nfooter\n",
    "src/b.ts": "title\nstatus: draft\nfooter\n",
    "src/c.ts": "title\nstatus: draft\nfooter\n",
    "src/d.ts": "title\nstatus: draft\nfooter\n",
  },
): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "coding-agents-target-set-plan-"),
  );
  tempRoots.push(workspaceRoot);
  for (const [relativePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(workspaceRoot, relativePath)), {
      recursive: true,
    });
    fs.writeFileSync(path.join(workspaceRoot, relativePath), content, "utf8");
  }
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

function mapping() {
  return {
    oldText: "status: draft",
    newText: "status: ready",
    source: "old-new-fenced-blocks" as const,
  };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}
