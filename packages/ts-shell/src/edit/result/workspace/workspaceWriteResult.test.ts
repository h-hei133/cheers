import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "../../../orchestration/patchResult/workspaceAuthority.js";
import { buildWorkspaceWriteRouteResult } from "./workspaceWriteResult.js";
import { runWorkspaceWriteRoute } from "../../../orchestration/patchResult/workspaceWriteRoute.js";

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
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        failureClass: "post-write-verification",
        changedFiles: [],
        failedFiles: [
          {
            path: "src/app.ts",
            reason: expect.stringContaining("post-write verification"),
          },
        ],
        writerInvoked: true,
        postWriteVerification: "failed",
        successLike: false,
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        routeId: "single-file-apply-patch-workspace-write",
        operationKinds: ["update"],
        plannedFiles: ["src/app.ts"],
        changedFiles: [],
        failedFiles: [
          expect.objectContaining({
            path: "src/app.ts",
            reason: expect.stringContaining("post-write verification"),
            failureClass: "post-write-verification",
          }),
        ],
        unrecoveredFiles: ["src/app.ts"],
        recoveryCandidateFiles: ["src/app.ts"],
        writerStarted: true,
        rollbackAtomicityClaim: false,
        recoveryExecuted: false,
        writeCapability: "metadata-only",
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal
        ?.recoveryPlan,
    ).toEqual(
      expect.objectContaining({
        mode: "plan-only",
        authority: "metadata-only",
        recoveryExecuted: false,
        rollbackAtomicityClaim: false,
        recoveryCandidateFiles: ["src/app.ts"],
        unrecoveredFiles: ["src/app.ts"],
        failedBeforeApplyFiles: [],
        appliedButUnverifiedFiles: ["src/app.ts"],
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal
        ?.recoveryPlan.recoveryReadiness,
    ).toEqual(
      expect.objectContaining({
        authorityKind: "none",
        authorityAvailability: "absent",
        persistence: "none",
        canRecover: false,
        canRollback: false,
        canRestoreOriginalContent: false,
      }),
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
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        changedFiles: [],
        failedFiles: [
          {
            path: "src/app.ts",
            reason: expect.stringContaining("Patch write failed"),
          },
        ],
        writerInvoked: true,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "blocked",
        successLike: false,
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        routeId: "single-file-apply-patch-workspace-write",
        changedFiles: [],
        failedFiles: [
          expect.objectContaining({
            path: "src/app.ts",
            reason: expect.stringContaining("Patch write failed"),
            failureClass: "write-application",
          }),
        ],
        recoveryCandidateFiles: [],
        unrecoveredFiles: [],
        writerStarted: true,
        rollbackAtomicityClaim: false,
        recoveryExecuted: false,
        writeCapability: "metadata-only",
      }),
    );
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
    expect(result.codingResult?.lastActionResultSeed).toMatchObject({
      target: "src/app.ts",
      changedFiles: [],
      verifiedFiles: [],
      verification: {
        status: "blocked",
      },
    });
    expect(result.codingResult?.lastActionResultSeed?.writerStarted).toBeUndefined();
    expect(result.codingResult?.lastActionResultSeed?.writeEffect).toBeUndefined();
    expect(
      result.codingResult?.lastActionResultSeed?.requiresUserInspection,
    ).toBeUndefined();
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

  it("maps final stale-read to per-file no-write failure without invoking the writer", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    let readCount = 0;
    const route = await runWorkspaceWriteRoute({
      workspaceRoot: fixture.workspaceRoot,
      rawPatchText: applyPatchText,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: "approved",
      defaultProductionRejectionUnchanged: true,
      readFile: authority.readFile,
      readVerifiedFile: (relativePath) => {
        readCount += 1;
        if (readCount === 1) {
          fs.writeFileSync(
            path.join(fixture.workspaceRoot, relativePath),
            "status: draft\nowner: changed-after-approval\n",
            "utf8",
          );
        }
        return authority.readVerifiedFile(relativePath);
      },
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: () => {
        throw new Error("writer must stay unreachable after stale-read");
      },
    });

    expect(route.status).toBe("blocked");
    expect(route.blocker).toBe("final-stale-read");
    expect(route.workspaceWriterInvoked).toBe(false);

    const result = buildWorkspaceWriteRouteResult({
      sessionId: "session-1",
      prompt: applyPatchText,
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        failureClass: "stale-read",
        changedFiles: [],
        failedFiles: [
          {
            path: "src/app.ts",
            reason: expect.stringContaining("stale-read"),
          },
        ],
        writerInvoked: false,
        postWriteVerification: "not-run",
        successLike: false,
      }),
    );
    expect(result.codingResult?.perFilePatchPlan?.operations[0]).toEqual(
      expect.objectContaining({
        targetPath: "src/app.ts",
        failedFile: {
          path: "src/app.ts",
          reason: expect.stringContaining("stale-read"),
        },
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        routeId: "single-file-apply-patch-workspace-write",
        operationKinds: ["update"],
        plannedFiles: ["src/app.ts"],
        changedFiles: [],
        failedFiles: [
          {
            path: "src/app.ts",
            reason: expect.stringContaining("stale-read"),
            failureClass: "preflight",
          },
        ],
        unrecoveredFiles: [],
        recoveryCandidateFiles: [],
        writerStarted: false,
        rollbackAtomicityClaim: false,
        recoveryExecuted: false,
        writeCapability: "metadata-only",
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal
        ?.recoveryPlan,
    ).toEqual(
      expect.objectContaining({
        mode: "plan-only",
        authority: "metadata-only",
        recoveryExecuted: false,
        rollbackAtomicityClaim: false,
        recoveryCandidateFiles: [],
        unrecoveredFiles: [],
        failedBeforeApplyFiles: ["src/app.ts"],
        appliedButUnverifiedFiles: [],
      }),
    );
    const recoveryPlan =
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal
        ?.recoveryPlan;
    expect(recoveryPlan?.originalContentAuthority.requirements).toEqual([
      expect.objectContaining({
        filePath: "src/app.ts",
        operationKind: "update",
        requiresOriginalContent: true,
        requiresCurrentContentCheck: true,
        requiresWorkspaceAuthority: true,
        requiresPersistence: true,
      }),
    ]);
    expect(recoveryPlan?.recoveryReadiness.restoreEligibility).toEqual(
      expect.objectContaining({
        canAttemptRestore: false,
        blockers: expect.arrayContaining([
          "no-original-content",
          "no-persistence-authority",
          "no-current-content-inspection",
          "no-recovery-executor",
        ]),
      }),
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
