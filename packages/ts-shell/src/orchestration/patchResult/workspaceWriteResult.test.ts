import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { buildWorkspaceWriteRouteResult } from "./workspaceWriteResult.js";
import { runWorkspaceWriteRoute } from "./workspaceWriteRoute.js";

const applyPatchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-status: draft",
  "+status: ready",
  "*** End Patch",
].join("\n");

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("single-file apply_patch workspace write result", () => {
  it("maps post-write verification failure to stopped readback mismatch without success leakage", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runWorkspaceWriteRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: () => {},
    });

    expect(route.status).toBe("blocked");
    expect(route.blocker).toBe("post-write-verification");
    expect(route.writeEffect).toBe("unverified");

    const result = buildWorkspaceWriteRouteResult({
      sessionId: "session-1",
      prompt: applyPatchText,
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.stopReason).toContain("post-write verification");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.changeSet.changedFiles).toEqual([]);
    expect(result.codingResult?.patches?.[0]?.failureCode).toBe(
      "readback-mismatch",
    );
    expect(result.codingResult?.repair.status).toBe("failed");
    expect(result.codingResult?.continuation.status).toBe(
      "failed-after-bounded-continuation",
    );
    expect(result.codingResult?.verification.status).toBe("blocked");
    expect(result.codingResult?.verification.blockerKind).toBe(
      "environment-not-ready",
    );
    expect(result.codingResult?.lastActionResultSeed).toMatchObject({
      target: "src/app.ts",
      changedFiles: [],
      verifiedFiles: [],
      writerStarted: true,
      writeEffect: "unverified",
      requiresUserInspection: true,
      verification: {
        status: "blocked",
      },
    });
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "actionable-blocker-kind:partial-mutation-failed",
        "actionable-blocker-kind:verification-failed",
        "apply-patch-workspace-write-result:write-effect:unverified",
        "apply-patch-workspace-write-result:user-inspection-required",
        "apply-patch-workspace-write-result:no-write-success",
      ]),
    );
  });

  it("maps writer application failures to stopped unknown write-effect recovery", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runWorkspaceWriteRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: () => {
        throw new Error("simulated writer failure after start");
      },
    });

    expect(route.status).toBe("blocked");
    expect(route.blocker).toBe("write-application");
    expect(route.writeEffect).toBe("unknown");

    const result = buildWorkspaceWriteRouteResult({
      sessionId: "session-1",
      prompt: applyPatchText,
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.patches?.[0]?.failureCode).toBe("write-failed");
    expect(result.codingResult?.repair.status).toBe("failed");
    expect(result.codingResult?.continuation.status).toBe(
      "failed-after-bounded-continuation",
    );
    expect(result.codingResult?.lastActionResultSeed).toMatchObject({
      target: "src/app.ts",
      changedFiles: [],
      verifiedFiles: [],
      writerStarted: true,
      writeEffect: "unknown",
      requiresUserInspection: true,
      verification: {
        status: "blocked",
      },
    });
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "actionable-blocker-kind:partial-mutation-failed",
        "apply-patch-workspace-write-result:write-effect:unknown",
        "apply-patch-workspace-write-result:writer-started-no-success",
        "apply-patch-workspace-write-result:user-inspection-required",
      ]),
    );
    expect(
      fs.readFileSync(path.join(fixture.workspaceRoot, "src", "app.ts"), "utf8"),
    ).toBe("status: draft\nowner: user-workspace\n");
  });

  it("maps workspace boundary failures to stopped write-failed attribution", async () => {
    const fixture = createFixture({ skipTarget: true });
    const outsideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "single-file-apply-patch-outside-"),
    );
    tempRoots.push(outsideRoot);
    const outsideTarget = path.join(outsideRoot, "app.ts");
    fs.writeFileSync(
      outsideTarget,
      "status: draft\nowner: outside-workspace\n",
      "utf8",
    );
    fs.symlinkSync(
      outsideTarget,
      path.join(fixture.workspaceRoot, "src", "app.ts"),
    );
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runWorkspaceWriteRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
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
    expect(route.blocker).toBe("workspace-boundary");

    const result = buildWorkspaceWriteRouteResult({
      sessionId: "session-1",
      prompt: applyPatchText,
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.patches?.[0]?.failureCode).toBe("write-failed");
    expect(result.codingResult?.verification.blockerKind).toBe(
      "environment-not-ready",
    );
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "actionable-blocker-kind:partial-mutation-failed",
        "apply-patch-workspace-write-result:write-effect:none",
        "apply-patch-workspace-write-result:no-write-success",
      ]),
    );
    expect(fs.readFileSync(outsideTarget, "utf8")).toBe(
      "status: draft\nowner: outside-workspace\n",
    );
  });
});

function createFixture(
  options: { readonly skipTarget?: boolean } = {},
): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-workspace-result-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  if (!options.skipTarget) {
    fs.writeFileSync(
      path.join(workspaceRoot, "src", "app.ts"),
      "status: draft\nowner: user-workspace\n",
      "utf8",
    );
  }
  return { workspaceRoot };
}
