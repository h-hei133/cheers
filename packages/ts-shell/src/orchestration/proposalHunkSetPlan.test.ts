import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProposalHunkSetPlan } from "./proposalHunkSetPlan.js";
import type { ProposalHunkSetManifest } from "./proposalHunkSet.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("proposalHunkSetPlan", () => {
  it("preflights all selected per-target exact mappings before mutation", () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "state: draft\n",
    });
    const plan = buildProposalHunkSetPlan({
      manifest: manifest(["src/a.ts", "src/b.ts"]),
      mappingByHunkId: new Map([
        ["h1", mapping("status: draft", "status: ready")],
        ["h2", mapping("state: draft", "state: ready")],
      ]),
      confirmed: true,
      ...fixture.options,
    });

    expect(plan.status).toBe("ready");
    expect(plan.evidence).toEqual(
      expect.arrayContaining([
        "proposal-hunk-set-plan:all-hunks-preflighted-before-mutation",
        "proposal-hunk-set-plan:multi-hunk-per-file-exact-policy",
        "proposal-hunk-set-plan:max-hunks-per-file:3",
      ]),
    );
  });

  it("stops duplicate or overlapping same-file hunk selections before mutation", () => {
    const fixture = createFixture({ "src/a.ts": "status: draft\n" });
    const plan = buildProposalHunkSetPlan({
      manifest: {
        ...manifest(["src/a.ts", "src/a.ts"]),
        selectedTargetPaths: ["src/a.ts"],
      },
      mappingByHunkId: new Map([
        ["h1", mapping("status: draft", "status: ready")],
        ["h2", mapping("status: draft", "status: done")],
      ]),
      confirmed: true,
      ...fixture.options,
    });

    expect(plan.status).toBe("blocked");
    expect(plan.evidence).toContain(
      "proposal-hunk-set-plan:blocker:conflicting-target-hunks",
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("status: draft\n");
  });

  it("preflights bounded non-overlapping multi-hunk selections in one file", () => {
    const fixture = createFixture({
      "src/a.ts": "alpha\nmiddle\nomega\n",
    });
    const plan = buildProposalHunkSetPlan({
      manifest: {
        ...manifest(["src/a.ts", "src/a.ts"]),
        selectedTargetPaths: ["src/a.ts"],
      },
      mappingByHunkId: new Map([
        ["h1", mapping("alpha", "ALPHA")],
        ["h2", mapping("omega", "OMEGA")],
      ]),
      confirmed: true,
      ...fixture.options,
    });

    expect(plan.status).toBe("ready");
    expect(plan.status === "ready" && plan.targets).toHaveLength(1);
    expect(plan.status === "ready" && plan.targets[0]?.hunkIds).toEqual(["h2", "h1"]);
    expect(plan.status === "ready" && plan.evidence).toEqual(
      expect.arrayContaining([
        "proposal-hunk-set-plan:multi-hunk-per-file-exact-policy",
        "exact-hunk-conflict:order:descending-original-range",
      ]),
    );
  });

  it("keeps unconfirmed, non-exact, and over-max hunk sets no-write", () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "state: draft\n",
      "src/c.ts": "mode: draft\n",
      "src/d.ts": "flag: draft\n",
    });
    const unconfirmed = buildProposalHunkSetPlan({
      manifest: manifest(["src/a.ts"]),
      mappingByHunkId: new Map([["h1", mapping("status: draft", "status: ready")]]),
      confirmed: false,
      ...fixture.options,
    });
    const nonExact = buildProposalHunkSetPlan({
      manifest: {
        ...manifest(["src/a.ts"]),
        selectedHunks: [
          {
            ...manifest(["src/a.ts"]).selectedHunks[0]!,
            exactMappingStatus: "non-exact",
            unsupportedReason: "fuzzy provider hunk",
          },
        ],
      },
      mappingByHunkId: new Map([["h1", mapping("status: draft", "status: ready")]]),
      confirmed: true,
      ...fixture.options,
    });
    const overMax = buildProposalHunkSetPlan({
      manifest: manifest(["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"]),
      mappingByHunkId: new Map([
        ["h1", mapping("status: draft", "status: ready")],
        ["h2", mapping("state: draft", "state: ready")],
        ["h3", mapping("mode: draft", "mode: ready")],
        ["h4", mapping("flag: draft", "flag: ready")],
      ]),
      confirmed: true,
      ...fixture.options,
    });
    const overMaxHunks = buildProposalHunkSetPlan({
      manifest: manifest(["src/a.ts", "src/b.ts"]),
      mappingByHunkId: new Map([
        ["h1", mapping("status: draft", "status: ready")],
        ["h2", mapping("state: draft", "state: ready")],
      ]),
      confirmed: true,
      maxHunks: 1,
      ...fixture.options,
    });

    expect(unconfirmed.status).toBe("blocked");
    expect(unconfirmed.evidence).toContain(
      "proposal-hunk-set-plan:blocker:selection-not-confirmed",
    );
    expect(nonExact.status).toBe("blocked");
    expect(nonExact.evidence).toContain(
      "proposal-hunk-set-plan:blocker:non-exact-hunk",
    );
    expect(overMax.status).toBe("blocked");
    expect(overMax.evidence).toContain(
      "proposal-hunk-set-plan:blocker:over-max-files",
    );
    expect(overMaxHunks.status).toBe("blocked");
    expect(overMaxHunks.evidence).toContain(
      "proposal-hunk-set-plan:blocker:over-max-hunks",
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("status: draft\n");
  });
});

function manifest(targets: readonly string[]): ProposalHunkSetManifest {
  return {
    hunkSetId: "proposal-hunk-set-test",
    sourceProposalId: "provider-edit-test",
    source: "provider",
    selectedTargetPaths: Array.from(new Set(targets)),
    selectedHunks: targets.map((target, index) => ({
      hunkId: `h${index + 1}`,
      targetLabel: target,
      targetPath: target,
      operationSummary: `edit ${target}`,
      exactMappingStatus: "exact",
      targetBinding: "single-target",
      redactionStatus: "raw-content-excluded",
    })),
    mutationAuthority: "not-granted",
    redactionStatus: "raw-content-excluded",
    evidence: ["proposal-hunk-set:raw-content-excluded"],
    transcriptSummary: "proposal-hunk-set proposal=provider-edit-test; raw-content-excluded",
  };
}

function createFixture(files: Record<string, string>) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-hunk-plan-"));
  tempRoots.push(workspaceRoot);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  return {
    workspaceRoot,
    options: {
      workspaceRoot,
      readFile: authority.readFile,
      validateWriteTarget: authority.validateWriteTarget,
    },
  };
}

function mapping(oldText: string, newText: string) {
  return { oldText, newText, source: "old-new-fenced-blocks" as const };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}
