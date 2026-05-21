import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDiscoveryEditManifest } from "./discoveryEditManifest.js";
import { runTargetSetEditRoute } from "./targetSetEditRoute.js";
import { buildTargetSetEditRouteResult } from "./targetSetEditResult.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("targetSetEditRoute", () => {
  it("executes a confirmed two-file exact fenced replacement through the existing single-file lane", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runTargetSetEditRoute({
      workspaceRoot: fixture.workspaceRoot,
      manifest: buildManifest(fixture.workspaceRoot, ["src/a.ts", "src/b.ts"]),
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
      mapping: mapping(),
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    });

    expect(route.status).toBe("written");
    expect(route.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "target-set-edit-route:reuse-existing-fenced-lane",
        "target-set-edit-route:no-automatic-rollback",
        "target-set-edit-rollback-ready",
        "fenced-edit-route:exact-replacement-written",
        "apply-patch-workspace-write-route:final-stale-read-immediately-before-writer",
        "apply-patch-workspace-write-route:post-write-verification-passed",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe(
      "title\nstatus: ready\nfooter\n",
    );
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe(
      "title\nstatus: ready\nfooter\n",
    );

    const result = buildTargetSetEditRouteResult({
      sessionId: "session-target-set",
      prompt: "confirmed target-set exact fenced replacement",
      route,
    });
    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.codingResult?.continuation.evidence).toEqual(
      expect.arrayContaining([
        "target-set-edit-result:continuation-safe",
        "target-set-edit-result:raw-content-excluded",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("status: ready");
    expect(JSON.stringify(result)).not.toContain("status: draft");
  });

  it("stops preflight failures before any target is mutated", async () => {
    const fixture = createFixture({
      "src/a.ts": "title\nstatus: draft\nfooter\n",
      "src/b.ts": "status: draft\nstatus: draft\n",
    });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runTargetSetEditRoute({
      workspaceRoot: fixture.workspaceRoot,
      manifest: buildManifest(fixture.workspaceRoot, ["src/a.ts", "src/b.ts"]),
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
      mapping: mapping(),
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: () => {
        throw new Error("writer must not run after preflight failure");
      },
    });

    expect(route.status).toBe("preflight-stopped");
    expect(route.changedFiles).toEqual([]);
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "target-set-edit-preflight-stopped",
        "target-set-edit-route:no-writer-invoked",
        "target-set-edit-mutation:not-run",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe(
      "title\nstatus: draft\nfooter\n",
    );
  });

  it("stops unsupported fuzzy, generated, and broad target-set edits before mutation", async () => {
    for (const unsupportedBlocker of [
      "unsupported-fuzzy",
      "unsupported-generated",
      "unsupported-broad",
    ] as const) {
      const fixture = createFixture();
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
      const route = await runTargetSetEditRoute({
        workspaceRoot: fixture.workspaceRoot,
        manifest: buildManifest(fixture.workspaceRoot, ["src/a.ts", "src/b.ts"]),
        confirmedTargetSet: ["src/a.ts", "src/b.ts"],
        mapping: mapping(),
        explicitRuntimeOptIn: true,
        explicitWorkspaceWriteOptIn: true,
        requestedUserDecision: "approved",
        defaultProductionRejectionUnchanged: true,
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        validateWriteTarget: authority.validateWriteTarget,
        writeFile: () => {
          throw new Error("writer must not run for unsupported target-set edit");
        },
        unsupportedBlocker,
      });

      expect(route.status).toBe("preflight-stopped");
      expect(route.changedFiles).toEqual([]);
      expect(route.plan.status).toBe("blocked");
      expect(route.plan.blocker).toBe(unsupportedBlocker);
      expect(route.evidence).toEqual(
        expect.arrayContaining([
          `target-set-edit-plan:blocker:${unsupportedBlocker}`,
          "target-set-edit-route:no-writer-invoked",
          "target-set-edit-mutation:not-run",
        ]),
      );
      expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe(
        "title\nstatus: draft\nfooter\n",
      );
      expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe(
        "title\nstatus: draft\nfooter\n",
      );
    }
  });

  it("reports partial failure with rollback readiness for already changed files", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runTargetSetEditRoute({
      workspaceRoot: fixture.workspaceRoot,
      manifest: buildManifest(fixture.workspaceRoot, ["src/a.ts", "src/b.ts"]),
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
      mapping: mapping(),
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
    expect(route.failedFiles.map((file) => file.path)).toEqual(["src/b.ts"]);
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "target-set-edit-outcome:target-set-edit-partial-failure",
        "target-set-edit-rollback-ready",
        "fenced-edit-outcome:fenced-edit-writer-failed",
        "edit-recovery-rollback:rollback-available",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe(
      "title\nstatus: ready\nfooter\n",
    );
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe(
      "title\nstatus: draft\nfooter\n",
    );

    const result = buildTargetSetEditRouteResult({
      sessionId: "session-target-set-partial",
      prompt: "confirmed target-set exact fenced replacement",
      route,
    });
    expect(result.terminalClassification).toBe("error");
    expect(result.codingResult?.changedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.failedFiles.map((file) => file.path)).toEqual([
      "src/b.ts",
    ]);
    expect(result.finalOutput).toContain("automatic rollback=no");
    expect(result.finalOutput).not.toContain("rollback succeeded");
  });

  it("reports a target-set stale-read on a later file without mutating that stale target", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    let bReads = 0;
    const route = await runTargetSetEditRoute({
      workspaceRoot: fixture.workspaceRoot,
      manifest: buildManifest(fixture.workspaceRoot, ["src/a.ts", "src/b.ts"]),
      confirmedTargetSet: ["src/a.ts", "src/b.ts"],
      mapping: mapping(),
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: (relativePath) => {
        if (relativePath === "src/b.ts") {
          bReads += 1;
          return bReads === 1
            ? "title\nstatus: changed externally\nfooter\n"
            : authority.readVerifiedFile(relativePath);
        }
        return authority.readVerifiedFile(relativePath);
      },
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    });

    expect(route.status).toBe("partial-failure");
    expect(route.changedFiles).toEqual(["src/a.ts"]);
    expect(route.failedFiles.map((file) => file.path)).toEqual(["src/b.ts"]);
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-outcome:fenced-edit-stale-read",
        "fenced-edit-mutation:not-run",
        "apply-patch-workspace-write-route:final-stale-read-blocked",
        "target-set-edit-rollback-ready",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe(
      "title\nstatus: ready\nfooter\n",
    );
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe(
      "title\nstatus: draft\nfooter\n",
    );
  });
});

function createFixture(
  files: Record<string, string> = {
    "src/a.ts": "title\nstatus: draft\nfooter\n",
    "src/b.ts": "title\nstatus: draft\nfooter\n",
  },
): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "coding-agents-target-set-route-"),
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
