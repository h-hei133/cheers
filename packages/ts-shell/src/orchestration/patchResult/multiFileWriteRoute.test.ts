import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";
import { runMultiFileWriteRoute } from "./multiFileWriteRoute.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("two-file Update File selected-workspace write route", () => {
  it("writes exactly two existing files after explicit approval and verifies both", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runMultiFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, twoFilePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: authority.writeFile,
    });

    expect(result.status).toBe("written");
    expect(result.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.failedFiles).toEqual([]);
    expect(result.writeIntents).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.approval).toMatchObject({
      status: "approved-for-write",
      targetPaths: ["src/a.ts", "src/b.ts"],
    });
    expect(result.writerStarted).toBe(true);
    expect(result.writeEffect).toBe("verified");
    expect(result.postWriteVerification).toBe("passed");
    expect(result.terminalClassification).toBe("success");
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe("b = 2\n");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "apply-patch-multi-file-write-route:exactly-two-update-files",
        "apply-patch-multi-file-write-route:all-final-stale-read-before-writer",
        "apply-patch-multi-file-write-route:sequential-write-no-rollback",
        "apply-patch-multi-file-write-route:post-write-verification-passed",
      ]),
    );
  });

  it("bypasses single-file Update File patches so the single-file route can own them", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runMultiFileWriteRoute({
      ...routeOptions(
        fixture.workspaceRoot,
        [
          "*** Begin Patch",
          "*** Update File: src/a.ts",
          "@@",
          "-a = 1",
          "+a = 2",
          "*** End Patch",
        ].join("\n"),
      ),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: () => {
        throw new Error("multi-file writer must not own single-file updates");
      },
    });

    expect(result.status).toBe("bypassed");
    expect(result.changedFiles).toEqual([]);
    expect(result.writeIntents).toEqual([]);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks 3+ Update File operations without invoking the writer", async () => {
    const fixture = createFixture({ includeC: true });
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    let writes = 0;

    const result = await runMultiFileWriteRoute({
      ...routeOptions(fixture.workspaceRoot, threeFilePatch()),
      readFile: authority.readFile,
      readVerifiedFile: authority.readVerifiedFile,
      validateWriteTarget: authority.validateWriteTarget,
      writeFile: () => {
        writes += 1;
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("too-many-files");
    expectNoPreWriterLeak(result);
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks Add/Delete/Move mixed operations without invoking the writer", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    for (const patchText of [mixedAddPatch(), mixedDeletePatch(), mixedMovePatch()]) {
      const result = await runMultiFileWriteRoute({
        ...routeOptions(fixture.workspaceRoot, patchText),
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        validateWriteTarget: authority.validateWriteTarget,
        writeFile: () => {
          throw new Error("writer must stay unreachable for mixed operations");
        },
      });

      expect(result.status).toBe("blocked");
      expect(result.blocker).toBe("unsupported-operation");
      expectNoPreWriterLeak(result);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    }
  });

  it("blocks missing targets, outside targets, and hunk mismatch before writing", async () => {
    const cases = [
      {
        patchText: missingTargetPatch(),
        failureCode: "patch-verify-file-missing",
      },
      {
        patchText: outsideTargetPatch(),
        failureCode: "patch-verify-path-outside-workspace",
      },
      {
        patchText: hunkMismatchPatch(),
        failureCode: "patch-verify-hunk-context-missing",
      },
    ];

    for (const testCase of cases) {
      const fixture = createFixture();
      const before = snapshotFixture(fixture.workspaceRoot);
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

      const result = await runMultiFileWriteRoute({
        ...routeOptions(fixture.workspaceRoot, testCase.patchText),
        readFile: authority.readFile,
        readVerifiedFile: authority.readVerifiedFile,
        validateWriteTarget: authority.validateWriteTarget,
        writeFile: () => {
          throw new Error("writer must stay unreachable for preflight failures");
        },
      });

      expect(result.status).toBe("blocked");
      expect(result.failedFiles[0]?.code).toBe(testCase.failureCode);
      expectNoPreWriterLeak(result);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
    }
  });

  it("requires approval and does not invoke the writer when denied", async () => {
    const fixture = createFixture();
    const before = snapshotFixture(fixture.workspaceRoot);
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runMultiFileWriteRoute({
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

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("write-decision");
    expect(result.approval.status).toBe("denied");
    expect(result.changedFiles).toEqual([]);
    expect(result.failedFiles).toEqual([]);
    expect(result.writeIntents).toEqual([]);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });

  it("blocks if either final stale-read fails before the first writer call", async () => {
    for (const staleTarget of ["src/a.ts", "src/b.ts"]) {
      const fixture = createFixture();
      const before = snapshotFixture(fixture.workspaceRoot);
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
      let writes = 0;
      const result = await runMultiFileWriteRoute({
        ...routeOptions(fixture.workspaceRoot, twoFilePatch()),
        readFile: authority.readFile,
        readVerifiedFile: (relativePath) => {
          if (relativePath === staleTarget) {
            fs.writeFileSync(
              path.join(fixture.workspaceRoot, relativePath),
              `${relativePath} changed after approval\n`,
              "utf8",
            );
          }
          return authority.readVerifiedFile(relativePath);
        },
        validateWriteTarget: authority.validateWriteTarget,
        writeFile: () => {
          writes += 1;
        },
      });

      expect(result.status).toBe("blocked");
      expect(result.blocker).toBe("final-stale-read");
      expect(result.failedFiles[0]?.path).toBe(staleTarget);
      expect(result.changedFiles).toEqual([]);
      expect(result.writeIntents).toEqual([]);
      expect(writes).toBe(0);
      expect(snapshotFixture(fixture.workspaceRoot)).toEqual({
        ...before,
        [staleTarget]: `${staleTarget} changed after approval\n`,
      });
    }
  });

  it("surfaces partial writer failure as stopped with only verified changed files", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runMultiFileWriteRoute({
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

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("write-application");
    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.failedFiles[0]?.path).toBe("src/b.ts");
    expect(result.writeEffect).toBe("unknown");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.terminalSuccessAllowed).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe("b = 1\n");
    expect(result.evidence).toContain(
      "apply-patch-multi-file-write-route:partial-failure-stopped",
    );
    expect(result.evidence).toContain("apply-patch-multi-file-write-route:no-rollback");
  });

  it("surfaces partial post-write verification failure without including the unverified file", async () => {
    const fixture = createFixture();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);

    const result = await runMultiFileWriteRoute({
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

    expect(result.status).toBe("blocked");
    expect(result.blocker).toBe("post-write-verification");
    expect(result.changedFiles).toEqual(["src/a.ts"]);
    expect(result.failedFiles[0]?.path).toBe("src/b.ts");
    expect(result.writeEffect).toBe("unverified");
    expect(result.postWriteVerification).toBe("failed");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.terminalSuccessAllowed).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/a.ts")).toBe("a = 2\n");
    expect(readFile(fixture.workspaceRoot, "src/b.ts")).toBe("unexpected\n");
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
    path.join(os.tmpdir(), "multi-file-write-route-"),
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

function mixedAddPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Add File: src/new.ts",
    "+new",
    "*** End Patch",
  ].join("\n");
}

function mixedDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Delete File: src/b.ts",
    "*** End Patch",
  ].join("\n");
}

function mixedMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/b.ts",
    "*** Move to: src/c.ts",
    "@@",
    "-b = 1",
    "+b = 2",
    "*** End Patch",
  ].join("\n");
}

function missingTargetPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/missing.ts",
    "@@",
    "-missing",
    "+ready",
    "*** End Patch",
  ].join("\n");
}

function outsideTargetPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: ../outside.ts",
    "@@",
    "-outside",
    "+ready",
    "*** End Patch",
  ].join("\n");
}

function hunkMismatchPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-not present",
    "+a = 2",
    "*** Update File: src/b.ts",
    "@@",
    "-b = 1",
    "+b = 2",
    "*** End Patch",
  ].join("\n");
}

function readFile(workspaceRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function snapshotFixture(workspaceRoot: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const relativePath of ["src/a.ts", "src/b.ts", "src/c.ts"]) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    if (fs.existsSync(absolutePath)) {
      snapshot[relativePath] = fs.readFileSync(absolutePath, "utf8");
    }
  }
  return snapshot;
}

function expectNoPreWriterLeak(result: Awaited<ReturnType<typeof runMultiFileWriteRoute>>) {
  expect(result.changedFiles).toEqual([]);
  expect(result.writeIntents).toEqual([]);
  expect(result.workspaceWriterInvoked).toBe(false);
  expect(result.writerStarted).toBe(false);
  expect(result.terminalSuccessAllowed).toBe(false);
  expect(result.mutationSuccessClaimAllowed).toBe(false);
}
