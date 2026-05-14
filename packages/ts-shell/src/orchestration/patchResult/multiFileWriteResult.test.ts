import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { buildMultiFileWriteRouteResult } from "./multiFileWriteResult.js";
import { runMultiFileWriteRoute } from "./multiFileWriteRoute.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("multi-file apply_patch workspace write result", () => {
  it("maps verified two-file writes to success with both changed files", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runMultiFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, twoFilePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    });

    const result = buildMultiFileWriteRouteResult({
      sessionId: "session-1",
      prompt: twoFilePatch(),
      route,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.codingResult?.verifiedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.codingResult?.failedFiles).toEqual([]);
    expect(result.codingResult?.lastActionResultSeed).toMatchObject({
      changedFiles: ["src/a.ts", "src/b.ts"],
      verifiedFiles: ["src/a.ts", "src/b.ts"],
      verification: { status: "passed" },
    });
  });

  it("maps verified three-file writes to success with all changed files", async () => {
    const fixture = createFixture({ includeC: true });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runMultiFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, threeFilePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    });

    const result = buildMultiFileWriteRouteResult({
      sessionId: "session-1",
      prompt: threeFilePatch(),
      route,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.changedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(result.codingResult?.changeSet.attemptedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "supported-write",
        failureClass: "none",
        writeIntentFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        changedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
        plannedFiles: [],
        failedFiles: [],
        writerInvoked: true,
        postWriteVerification: "passed",
        successLike: true,
      }),
    );
    expect(result.codingResult?.lastActionResultSeed).toMatchObject({
      changedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
      verifiedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
      verification: { status: "passed" },
    });
  });

  it("maps approval denial to stopped without failed or changed files", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runMultiFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, twoFilePatch(), {
        requestedUserDecision: "denied",
      }),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: () => {
        throw new Error("writer must stay unreachable after denial");
      },
    });

    const result = buildMultiFileWriteRouteResult({
      sessionId: "session-1",
      prompt: twoFilePatch(),
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.failedFiles).toEqual([]);
    expect(result.codingResult?.verification.blockerKind).toBe("approval-denied");
    expect(result.codingResult?.lastActionResultSeed).toMatchObject({
      changedFiles: [],
      verifiedFiles: [],
      verification: { status: "blocked", blockerKind: "approval-denied" },
    });
    expect(result.codingResult?.lastActionResultSeed?.writerStarted).toBeUndefined();
  });

  it("maps partial writer failure to stopped with verified changed prefix and failed file", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runMultiFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, twoFilePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: (relativePath, content) => {
        if (relativePath === "src/b.ts") {
          throw new Error("simulated second writer failure");
        }
        authority.writeFile(relativePath, content);
      },
    });

    const result = buildMultiFileWriteRouteResult({
      sessionId: "session-1",
      prompt: twoFilePatch(),
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.verifiedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.failedFiles).toEqual([
      {
        path: "src/b.ts",
        reason: expect.stringContaining("Patch write failed"),
      },
    ]);
    expect(result.codingResult?.changeSet.changedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.changeSet.unchangedAttemptedFiles).toEqual([
      "src/b.ts",
    ]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        failureClass: "partial-failure",
        changedFiles: ["src/a.ts"],
        failedFiles: [
          {
            path: "src/b.ts",
            reason: expect.stringContaining("Patch write failed"),
          },
        ],
        writerInvoked: true,
        postWriteVerification: "blocked",
        successLike: false,
      }),
    );
    expect(result.codingResult?.perFilePatchPlan?.operations).toEqual([
      expect.objectContaining({
        targetPath: "src/a.ts",
        changedFile: "src/a.ts",
      }),
      expect.objectContaining({
        targetPath: "src/b.ts",
        failedFile: {
          path: "src/b.ts",
          reason: expect.stringContaining("Patch write failed"),
        },
      }),
    ]);
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        source: "route-scoped-edit-journal",
        routeId: "multi-file-apply-patch-workspace-write",
        changedFiles: ["src/a.ts"],
        verifiedFiles: ["src/a.ts"],
        failedFiles: [
          {
            path: "src/b.ts",
            reason: expect.stringContaining("Patch write failed"),
            failureClass: "write-application",
          },
        ],
        recoveryCandidateFiles: ["src/a.ts"],
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
        recoveryCandidateFiles: ["src/a.ts"],
        unrecoveredFiles: [],
        failedBeforeApplyFiles: ["src/b.ts"],
        appliedButUnverifiedFiles: [],
        appliedAndVerifiedBeforeLaterFailureFiles: ["src/a.ts"],
      }),
    );
    expect(result.codingResult?.lastActionResultSeed).toMatchObject({
      target: "src/b.ts",
      changedFiles: ["src/a.ts"],
      verifiedFiles: ["src/a.ts"],
      writerStarted: true,
      writeEffect: "unknown",
      requiresUserInspection: true,
      verification: { status: "blocked" },
    });
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "actionable-blocker-kind:partial-mutation-failed",
        "apply-patch-multi-file-write-result:changed-files-verified-only",
        "apply-patch-multi-file-write-result:writer-started-no-success",
        "apply-patch-multi-file-write-result:no-rollback",
      ]),
    );
  });

  it("maps partial post-write verification failure to stopped without unverified changed file", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runMultiFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, twoFilePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: (relativePath, content) => {
        authority.writeFile(
          relativePath,
          relativePath === "src/b.ts" ? "unexpected\n" : content,
        );
      },
    });

    const result = buildMultiFileWriteRouteResult({
      sessionId: "session-1",
      prompt: twoFilePatch(),
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.verifiedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.failedFiles[0]?.path).toBe("src/b.ts");
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        failureClass: "post-write-verification",
        changedFiles: ["src/a.ts"],
        failedFiles: [
          {
            path: "src/b.ts",
            reason: expect.stringContaining("post-write verification failed"),
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
        routeId: "multi-file-apply-patch-workspace-write",
        changedFiles: ["src/a.ts"],
        failedFiles: [
          {
            path: "src/b.ts",
            reason: expect.stringContaining("post-write verification failed"),
            failureClass: "post-write-verification",
          },
        ],
        unrecoveredFiles: ["src/b.ts"],
        recoveryCandidateFiles: ["src/a.ts", "src/b.ts"],
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
        recoveryCandidateFiles: ["src/a.ts", "src/b.ts"],
        unrecoveredFiles: ["src/b.ts"],
        failedBeforeApplyFiles: [],
        appliedButUnverifiedFiles: ["src/b.ts"],
        appliedAndVerifiedBeforeLaterFailureFiles: ["src/a.ts"],
        blockers: expect.arrayContaining([
          "metadata-only-journal",
          "no-durable-snapshot",
          "no-original-content",
          "no-recovery-executor",
          "no-atomicity-authority",
          "no-persistence-authority",
        ]),
      }),
    );
    expect(result.codingResult?.lastActionResultSeed).toMatchObject({
      target: "src/b.ts",
      changedFiles: ["src/a.ts"],
      verifiedFiles: ["src/a.ts"],
      writerStarted: true,
      writeEffect: "unverified",
      requiresUserInspection: true,
    });
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "actionable-blocker-kind:partial-mutation-failed",
        "actionable-blocker-kind:verification-failed",
        "apply-patch-multi-file-write-result:no-write-success",
        "apply-patch-multi-file-write-result:no-rollback",
      ]),
    );
  });

  it("maps three-file partial writer failure to stopped with changed and failed files distinct", async () => {
    const fixture = createFixture({ includeC: true });
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const route = await runMultiFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, threeFilePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: (relativePath, content) => {
        if (relativePath === "src/c.ts") {
          throw new Error("simulated third writer failure");
        }
        authority.writeFile(relativePath, content);
      },
    });

    const result = buildMultiFileWriteRouteResult({
      sessionId: "session-1",
      prompt: threeFilePatch(),
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.codingResult?.verifiedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.codingResult?.failedFiles).toEqual([
      {
        path: "src/c.ts",
        reason: expect.stringContaining("Patch write failed"),
      },
    ]);
    expect(result.codingResult?.changeSet.changedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(result.codingResult?.changeSet.unchangedAttemptedFiles).toEqual([
      "src/c.ts",
    ]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        failureClass: "partial-failure",
        changedFiles: ["src/a.ts", "src/b.ts"],
        failedFiles: [
          {
            path: "src/c.ts",
            reason: expect.stringContaining("Patch write failed"),
          },
        ],
        writerInvoked: true,
        postWriteVerification: "blocked",
        successLike: false,
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        changedFiles: ["src/a.ts", "src/b.ts"],
        failedFiles: [
          expect.objectContaining({
            path: "src/c.ts",
            failureClass: "write-application",
          }),
        ],
        recoveryCandidateFiles: ["src/a.ts", "src/b.ts"],
        unrecoveredFiles: [],
        rollbackAtomicityClaim: false,
        recoveryExecuted: false,
        writeCapability: "metadata-only",
      }),
    );
  });
});

function routeOptions(
  workspaceRoot: string,
  rawPatchText: string,
  options: { readonly requestedUserDecision?: "approved" | "denied" } = {},
) {
  return {
    workspaceRoot,
    rawPatchText,
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: options.requestedUserDecision ?? "approved",
    defaultProductionRejectionUnchanged: true as const,
  };
}

function createFixture(
  options: { readonly includeC?: boolean } = {},
): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "multi-file-write-result-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "a = 1\n", "utf8");
  fs.writeFileSync(path.join(workspaceRoot, "src", "b.ts"), "b = 1\n", "utf8");
  if (options.includeC) {
    fs.writeFileSync(path.join(workspaceRoot, "src", "c.ts"), "c = 1\n", "utf8");
  }
  return { workspaceRoot };
}

function twoFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/b.ts",
    "@@",
    "-b = 1",
    "+b = 2",
    "*** End Patch",
  ].join("\n");
}

function threeFilePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/b.ts",
    "@@",
    "-b = 1",
    "+b = 2",
    "*** Update File: src/c.ts",
    "@@",
    "-c = 1",
    "+c = 2",
    "*** End Patch",
  ].join("\n");
}
