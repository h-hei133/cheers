import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runProposalHunkSetRoute } from "./proposalHunkSetRoute.js";
import type { ProposalHunkSetManifest } from "./proposalHunkSet.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("proposalHunkSetRoute", () => {
  it("applies confirmed per-target distinct exact mappings through existing fenced lanes", async () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "state: draft\n",
    });
    const route = await runProposalHunkSetRoute({
      ...fixture.options,
      manifest: manifest(["src/a.ts", "src/b.ts"]),
      mappingByHunkId: new Map([
        ["h1", mapping("status: draft", "status: ready")],
        ["h2", mapping("state: draft", "state: ready")],
      ]),
      confirmed: true,
    });

    expect(route.status).toBe("written");
    expect(route.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(route.verificationAggregate.overallStatus).toBe("passed");
    expect(route.recoveryWorkflow.status).toBe("not-needed");
    expect(route.transaction.outcome).toBe("succeeded");
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "proposal-hunk-set-route:reuse-existing-fenced-lane",
        "proposal-hunk-set-route:no-new-writer",
        "proposal-hunk-set-route:no-provider-call",
        "proposal-hunk-set-journal:all-hunks-before-first-write",
        "fenced-edit-route:exact-replacement-written",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("status: ready\n");
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe("state: ready\n");
  });

  it("stops all mutation when any selected exact mapping fails preflight", async () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "state: draft\nstate: draft\n",
    });
    const route = await runProposalHunkSetRoute({
      ...fixture.options,
      manifest: manifest(["src/a.ts", "src/b.ts"]),
      mappingByHunkId: new Map([
        ["h1", mapping("status: draft", "status: ready")],
        ["h2", mapping("state: draft", "state: ready")],
      ]),
      confirmed: true,
      writeFile: () => {
        throw new Error("writer must not run after hunk-set preflight failure");
      },
    });

    expect(route.status).toBe("preflight-stopped");
    expect(route.changedFiles).toEqual([]);
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "proposal-hunk-set-plan:blocker:multiple-matches",
        "proposal-hunk-set-route:mutation:not-run",
        "proposal-hunk-set-route:no-writer-invoked",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("status: draft\n");
  });

  it("separates changed, failed, and unattempted files with recovery evidence", async () => {
    const fixture = createFixture({
      "src/a.ts": "status: draft\n",
      "src/b.ts": "state: draft\n",
      "src/c.ts": "mode: draft\n",
    });
    const route = await runProposalHunkSetRoute({
      ...fixture.options,
      manifest: manifest(["src/a.ts", "src/b.ts", "src/c.ts"]),
      mappingByHunkId: new Map([
        ["h1", mapping("status: draft", "status: ready")],
        ["h2", mapping("state: draft", "state: ready")],
        ["h3", mapping("mode: draft", "mode: ready")],
      ]),
      confirmed: true,
      writeFile: (relativePath, content) => {
        if (relativePath === "src/b.ts") {
          throw new Error("simulated hunk-set write failure");
        }
        return fixture.options.writeFile(relativePath, content);
      },
    });

    expect(route.status).toBe("partial-failure");
    expect(route.changedFiles).toEqual(["src/a.ts"]);
    expect(route.failedFiles.map((file) => file.path)).toEqual(["src/b.ts"]);
    expect(route.unattemptedFiles.map((file) => file.path)).toEqual(["src/c.ts"]);
    expect(route.recoveryWorkflow.status).toBe("available");
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "target-set-edit-transaction:outcome:recovery-available",
        "target-set-edit-verification:recovery-recommended",
        "target-set-edit-recovery-workflow:status:available",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("status: ready\n");
    expect(readFile(fixture.workspaceRoot, "src/c.ts")).toBe("mode: draft\n");
  });
});

function manifest(targets: readonly string[]): ProposalHunkSetManifest {
  return {
    hunkSetId: "proposal-hunk-set-route-test",
    sourceProposalId: "provider-edit-test",
    source: "provider",
    selectedTargetPaths: targets,
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
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-hunk-route-"));
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
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved" as const,
      defaultProductionRejectionUnchanged: true as const,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    },
  };
}

function mapping(oldText: string, newText: string) {
  return { oldText, newText, source: "old-new-fenced-blocks" as const };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}
