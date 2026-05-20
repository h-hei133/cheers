import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runFencedEditReplacementRoute } from "./fencedEditRoute.js";
import { buildFencedEditReplacementRouteResult } from "./fencedEditResult.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("fencedEditRoute", () => {
  it("writes one exact fenced replacement through workspace authority and verification", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const route = await runFencedEditReplacementRoute({
      workspaceRoot: fixture.workspaceRoot,
      targetPath: "src/app.ts",
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
      writeFile: authority.writeFile,
    });

    expect(route.status).toBe("written");
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe(
      "title\nstatus: ready\nfooter\n",
    );
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-route:exact-replacement-written",
        "fenced-edit-plan:exact-mapping-ready",
        "apply-patch-workspace-write-route:final-stale-read-immediately-before-writer",
        "apply-patch-workspace-write-route:post-write-verification-passed",
        "fenced-edit-route:continuation-safe-evidence",
      ]),
    );

    const result = buildFencedEditReplacementRouteResult({
      sessionId: "session-1",
      prompt: "replace exact fenced block",
      route,
    });
    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.changedFiles).toEqual(["src/app.ts"]);
    expect(result.codingResult?.continuation.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-result:operation:fenced-replacement",
        "fenced-edit-result:state:changed",
        "fenced-edit-result:raw-content-excluded",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("status: ready");
  });

  it("stops before writer for missing target, missing mapping, and multiple matches", async () => {
    const fixture = createFixture("status: draft\nstatus: draft\n");
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const missingTarget = await runFencedEditReplacementRoute({
      workspaceRoot: fixture.workspaceRoot,
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
      writeFile: authority.writeFile,
    });
    expect(missingTarget.status).toBe("blocked");
    expect(missingTarget.blocker).toBe("missing-target");
    expect(missingTarget.evidence).toContain("fenced-edit-route:no-writer-invoked");

    const missingMapping = await runFencedEditReplacementRoute({
      workspaceRoot: fixture.workspaceRoot,
      targetPath: "src/app.ts",
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    });
    expect(missingMapping.status).toBe("blocked");
    expect(missingMapping.blocker).toBe("missing-mapping");

    const multiple = await runFencedEditReplacementRoute({
      workspaceRoot: fixture.workspaceRoot,
      targetPath: "src/app.ts",
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
      writeFile: authority.writeFile,
    });
    expect(multiple.status).toBe("blocked");
    expect(multiple.blocker).toBe("multiple-matches");
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe(
      "status: draft\nstatus: draft\n",
    );
  });

  it("blocks out-of-workspace targets through workspace authority before planning a write", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const route = await runFencedEditReplacementRoute({
      workspaceRoot: fixture.workspaceRoot,
      targetPath: "../outside.ts",
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
      writeFile: authority.writeFile,
    });

    expect(route.status).toBe("blocked");
    expect(route.blocker).toBe("workspace-path-outside-workspace");
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-route:workspace-authority-blocked",
        "apply-patch-workspace-authority:path-outside-workspace",
        "fenced-edit-route:no-writer-invoked",
      ]),
    );
  });

  it("preserves stale-read stopped truthfulness from the workspace write route", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    let finalReads = 0;

    const route = await runFencedEditReplacementRoute({
      workspaceRoot: fixture.workspaceRoot,
      targetPath: "src/app.ts",
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
      readVerifiedFile: (relativePath) => {
        finalReads += 1;
        return finalReads === 1
          ? "title\nstatus: changed externally\nfooter\n"
          : authority.readVerifiedFile(relativePath);
      },
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    });

    expect(route.status).toBe("blocked");
    expect(route.blocker).toBe("workspace-final-stale-read");
    expect(route.postWriteVerification).toBe("not-run");
    expect(route.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-route:workspace-route-blocked",
        "apply-patch-workspace-write-route:final-stale-read-blocked",
        "apply-patch-workspace-write-route:no-success-claim",
      ]),
    );

    const result = buildFencedEditReplacementRouteResult({
      sessionId: "session-1",
      prompt: "replace exact fenced block",
      route,
    });
    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.verification.status).toBe("blocked");
    expect(result.codingResult?.continuation.evidence).toContain(
      "fenced-edit-result:state:stopped",
    );
  });
});

function createFixture(content = "title\nstatus: draft\nfooter\n"): {
  readonly workspaceRoot: string;
} {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "coding-agents-fenced-edit-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "app.ts"), content);
  return { workspaceRoot };
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}
