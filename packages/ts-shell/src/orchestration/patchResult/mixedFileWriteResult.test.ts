import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMixedFileWriteRouteResult } from "./mixedFileWriteResult.js";
import { runMixedFileWriteRoute } from "./mixedFileWriteRoute.js";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("mixed file write result journal metadata", () => {
  it("attaches journal metadata to partial failure without changing result fields", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const route = await runMixedFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, updateCreatePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateWriteTarget: authority.validateWriteTarget,
      validateCreateTarget: authority.validateCreateTarget,
      writeFile: authority.writeFile,
      createFileExclusive: () => {
        throw new Error("simulated create failure");
      },
      moveFileExclusive: authority.moveFileExclusive,
      deleteFile: authority.deleteFile,
    });

    const result = buildMixedFileWriteRouteResult({
      sessionId: "session-1",
      prompt: updateCreatePatch(),
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.verifiedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.failedFiles).toEqual([
      {
        path: "src/new.ts",
        reason: expect.stringContaining("Patch mixed write failed"),
      },
    ]);
    expect(result.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        failureClass: "partial-failure",
        changedFiles: ["src/a.ts"],
        failedFiles: [
          {
            path: "src/new.ts",
            reason: expect.stringContaining("Patch mixed write failed"),
          },
        ],
        writerInvoked: true,
        creatorInvoked: true,
        deleteMoveInvoked: false,
        postWriteVerification: "blocked",
        successLike: false,
      }),
    );
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        source: "route-scoped-edit-journal",
        routeId: "mixed-file-apply-patch-workspace-write",
        changedFiles: ["src/a.ts"],
        verifiedFiles: ["src/a.ts"],
        failedFiles: [
          {
            path: "src/new.ts",
            reason: expect.stringContaining("Patch mixed write failed"),
            failureClass: "write-application",
          },
        ],
        recoveryCandidateFiles: ["src/a.ts"],
        rollbackAtomicityClaim: false,
        recoveryExecuted: false,
        writeCapability: "metadata-only",
      }),
    );
  });
});

function routeOptions(workspaceRoot: string, rawPatchText: string) {
  return {
    workspaceRoot,
    rawPatchText,
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: "approved" as const,
    defaultProductionRejectionUnchanged: true as const,
  };
}

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "mixed-file-write-result-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "a = 1\n", "utf8");
  return { workspaceRoot };
}

function updateCreatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Add File: src/new.ts",
    "+created",
    "*** End Patch",
  ].join("\n");
}
