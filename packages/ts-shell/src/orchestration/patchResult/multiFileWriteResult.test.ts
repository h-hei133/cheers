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

describe("two-file apply_patch workspace write result", () => {
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

function createFixture(): { readonly workspaceRoot: string } {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "multi-file-write-result-"),
  );
  tempRoots.push(workspaceRoot);
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "a = 1\n", "utf8");
  fs.writeFileSync(path.join(workspaceRoot, "src", "b.ts"), "b = 1\n", "utf8");
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
