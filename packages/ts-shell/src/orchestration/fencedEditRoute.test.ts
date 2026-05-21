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
        "fenced-edit-outcome:fenced-edit-success",
        "fenced-edit-mutation:ran",
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
        "fenced-edit-outcome:fenced-edit-success",
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
    expect(missingTarget.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-outcome:fenced-edit-missing-target",
        "fenced-edit-mutation:not-run",
        "actionable-blocker-kind:patch-target-missing",
      ]),
    );

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
    expect(missingMapping.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-outcome:fenced-edit-missing-mapping",
        "actionable-blocker-kind:patch-content-missing",
      ]),
    );

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
    expect(multiple.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-outcome:fenced-edit-multiple-matches",
        "actionable-blocker-kind:ambiguous-target",
      ]),
    );
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe(
      "status: draft\nstatus: draft\n",
    );
  });

  it("stops no-match and dry-run/no-write paths without mutation", async () => {
    const fixture = createFixture("status: current\n");
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const noMatch = await runFencedEditReplacementRoute({
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
    expect(noMatch.status).toBe("blocked");
    expect(noMatch.blocker).toBe("mapping-not-found");
    expect(noMatch.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-outcome:fenced-edit-no-match",
        "fenced-edit-mutation:not-run",
        "actionable-blocker-kind:patch-from-not-found",
      ]),
    );

    const dryRunBlocked = await runFencedEditReplacementRoute({
      workspaceRoot: fixture.workspaceRoot,
      targetPath: "src/app.ts",
      mapping: {
        oldText: "status: current",
        newText: "status: ready",
        source: "old-new-fenced-blocks",
      },
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: false,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    });
    expect(dryRunBlocked.status).toBe("blocked");
    expect(dryRunBlocked.evidence).toContain("fenced-edit-mutation:not-run");
    expect(dryRunBlocked.evidence).toContain(
      "apply-patch-workspace-write-route:no-writer-invoked",
    );
    expect(readFile(fixture.workspaceRoot, "src/app.ts")).toBe("status: current\n");
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
        "fenced-edit-outcome:fenced-edit-stale-read",
        "actionable-blocker-kind:stale-read",
        "fenced-edit-mutation:not-run",
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
    expect(result.codingResult?.continuation.evidence).toContain(
      "fenced-edit-outcome:fenced-edit-stale-read",
    );
    expect(result.finalOutput).toContain(
      "fenced replacement stopped before writing.",
    );
    expect(result.finalOutput).toContain("Next:");
    expect(result.finalOutput).not.toContain("status: ready");
  });

  it("surfaces writer and verification failures as failed outcomes", async () => {
    const writerFixture = createFixture();
    const writerAuthority = createWorkspaceWriteAuthority(
      writerFixture.workspaceRoot,
    );

    const writerFailed = await runFencedEditReplacementRoute({
      workspaceRoot: writerFixture.workspaceRoot,
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
      readFile: writerAuthority.readFile,
      readVerifiedFile: writerAuthority.readVerifiedFile,
      validateWriteTarget: writerAuthority.validateWriteTarget,
      writeFile: () => {
        throw new Error("fixture write denied");
      },
    });
    expect(writerFailed.status).toBe("blocked");
    expect(writerFailed.terminalClassification).toBe("error");
    expect(writerFailed.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-outcome:fenced-edit-writer-failed",
        "fenced-edit-mutation:ran",
        "actionable-blocker-kind:partial-mutation-failed",
      ]),
    );
    const writerResult = buildFencedEditReplacementRouteResult({
      sessionId: "session-1",
      prompt: "replace exact fenced block",
      route: writerFailed,
    });
    expect(writerResult.terminalClassification).toBe("error");
    expect(writerResult.codingResult?.verification.status).toBe("failed");

    const verificationFixture = createFixture();
    const verificationAuthority = createWorkspaceWriteAuthority(
      verificationFixture.workspaceRoot,
    );
    let verificationReads = 0;
    const verificationFailed = await runFencedEditReplacementRoute({
      workspaceRoot: verificationFixture.workspaceRoot,
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
      readFile: verificationAuthority.readFile,
      readVerifiedFile: (relativePath) => {
        if (relativePath === "src/app.ts") {
          verificationReads += 1;
          return verificationReads === 1
            ? verificationAuthority.readVerifiedFile(relativePath)
            : "title\nstatus: stale-after-write\nfooter\n";
        }
        return verificationAuthority.readVerifiedFile(relativePath);
      },
      validateWriteTarget: verificationAuthority.validateWriteTarget,
      writeFile: verificationAuthority.writeFile,
    });
    expect(verificationFailed.status).toBe("blocked");
    expect(verificationFailed.terminalClassification).toBe("error");
    expect(verificationFailed.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-outcome:fenced-edit-verification-failed",
        "fenced-edit-mutation:ran",
        "actionable-blocker-kind:verification-failed",
      ]),
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
