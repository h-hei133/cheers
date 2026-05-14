import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { buildWorkspaceCreateRouteResult } from "./workspaceCreateResult.js";
import { runWorkspaceCreateRoute } from "./workspaceCreateRoute.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("single-file Add File workspace create result", () => {
  it("maps verified create to write-file success with changedFiles only after readback", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const prompt = addPatch("src/new.ts", "ready");
    const route = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, prompt),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: authority.createFileExclusive,
    });

    expect(route.status).toBe("created");

    const result = buildWorkspaceCreateRouteResult({
      sessionId: "session-1",
      prompt,
      route,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.taskKind).toBe("write-file");
    expect(result.codingResult?.changedFiles).toEqual(["src/new.ts"]);
    expect(result.codingResult?.changeSet.changedFiles).toEqual(["src/new.ts"]);
    expect(result.codingResult?.verifiedFiles).toEqual(["src/new.ts"]);
    expect(result.codingResult?.lastActionResultSeed).toMatchObject({
      actionKind: "write-file",
      target: "src/new.ts",
      changedFiles: ["src/new.ts"],
      verifiedFiles: ["src/new.ts"],
      verification: { status: "passed" },
    });
  });

  it("maps post-write verification failure to stopped without changedFiles", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const prompt = addPatch("src/new.ts", "ready");
    const route = await runWorkspaceCreateRoute({
      ...routeOptions(fixture.workspaceRoot, prompt),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      directoryExists: authority.directoryExists,
      validateCreateTarget: authority.validateCreateTarget,
      createFileExclusive: (relativePath) => {
        authority.createFileExclusive(relativePath, "wrong");
      },
    });

    expect(route.status).toBe("blocked");
    expect(route.blocker).toBe("post-write-verification");

    const result = buildWorkspaceCreateRouteResult({
      sessionId: "session-1",
      prompt,
      route,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.taskKind).toBe("write-file");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.changeSet.changedFiles).toEqual([]);
    expect(result.codingResult?.verification.status).toBe("blocked");
    expect(result.codingResult?.verification.blockerKind).toBe(
      "environment-not-ready",
    );
    expect(result.codingResult?.lastActionResultSeed).toMatchObject({
      target: "src/new.ts",
      changedFiles: [],
      verifiedFiles: [],
      writerStarted: true,
      writeEffect: "unverified",
      requiresUserInspection: true,
      verification: { status: "blocked" },
    });
    expect(
      result.codingResult?.perFilePatchPlan?.routeScopedEditJournal,
    ).toEqual(
      expect.objectContaining({
        routeId: "single-file-apply-patch-workspace-create",
        operationKinds: ["create"],
        plannedFiles: ["src/new.ts"],
        changedFiles: [],
        failedFiles: [
          expect.objectContaining({
            path: "src/new.ts",
            failureClass: "post-write-verification",
          }),
        ],
        unrecoveredFiles: ["src/new.ts"],
        recoveryCandidateFiles: ["src/new.ts"],
        writerStarted: true,
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

function addPatch(relativePath: string, content: string): string {
  return [
    "*** Begin Patch",
    `*** Add File: ${relativePath}`,
    ...content.split("\n").map((line) => `+${line}`),
    "*** End Patch",
  ].join("\n");
}

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "single-file-apply-patch-workspace-create-result-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "app.ts"), "draft\n", "utf8");
  return { workspaceRoot };
}
