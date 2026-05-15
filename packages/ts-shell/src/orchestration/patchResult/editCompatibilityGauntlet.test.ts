import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeBoundedBroadPatchText } from "../patchParsing/boundedBroadPatchNormalizer.js";
import { classifyBoundedApplyPatchCandidate } from "./boundedApplyPatchCandidate.js";
import { projectApplyPatchRuntimeMutationRoute } from "../mutationRoutingProjection.js";
import { readRecoveryAuthorityRecord } from "../patchRecovery/recoveryAuthorityStore.js";
import { restoreRecoveryAuthorityRecord } from "../patchRecovery/restorePrimitive.js";
import { createWorkspaceWriteAuthority } from "./workspaceAuthority.js";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

type FixtureCase = {
  readonly name: string;
  readonly sourceKind:
    | "marker-apply-patch"
    | "git-style-diff"
    | "model-output-with-prose"
    | "malformed"
    | "unsupported-metadata";
  readonly patchText: string;
  readonly expectedStatus: "supported" | "blocked";
  readonly expectedFamily:
    | "single"
    | "update-only"
    | "mixed"
    | "delete-only"
    | "move-only"
    | "unsupported";
  readonly expectedOperationCount: number;
  readonly expectedBlockedReason?: string;
  readonly expectedAffectedPaths: readonly string[];
  readonly shouldReachRouting: boolean;
  readonly shouldCaptureRecoveryAuthority: boolean;
  readonly shouldRemainNoWrite: boolean;
};

describe("realistic edit compatibility gauntlet", () => {
  it("classifies supported marker, git-style, prose, bounded, mixed, and rename-content fixtures", () => {
    const supported: readonly FixtureCase[] = [
      supportedCase("marker single update", "marker-apply-patch", markerUpdatePatch(), "single", 1, ["src/a.ts"]),
      supportedCase("marker add file", "marker-apply-patch", markerAddPatch("src/new.ts", "created"), "single", 1, ["src/new.ts"]),
      supportedCase("marker delete file", "marker-apply-patch", markerDeletePatch("src/remove.ts"), "single", 1, ["src/remove.ts"]),
      supportedCase("marker pure move file", "marker-apply-patch", markerPureMovePatch("src/from.ts", "src/to.ts"), "single", 1, ["src/from.ts", "src/to.ts"]),
      supportedCase("marker 32 update-only", "marker-apply-patch", markerUpdateBatch(32), "update-only", 32, generatedUpdatePaths(32)),
      supportedCase("marker bounded mixed", "marker-apply-patch", markerMixedPatch(), "mixed", 4, ["src/a.ts", "src/new.ts", "src/remove.ts", "src/from.ts", "src/to.ts"]),
      supportedCase("git single update", "git-style-diff", gitUpdatePatch("src/a.ts", "a = 1", "a = 2"), "single", 1, ["src/a.ts"]),
      supportedCase("git multi-hunk update", "git-style-diff", gitMultiHunkPatch(), "single", 1, ["src/a.ts"]),
      supportedCase("git add file", "git-style-diff", gitAddPatch("src/new.ts", "created"), "single", 1, ["src/new.ts"]),
      supportedCase("git delete file", "git-style-diff", gitDeletePatch("src/remove.ts", "remove"), "single", 1, ["src/remove.ts"]),
      supportedCase("git pure rename", "git-style-diff", gitPureRenamePatch("src/from.ts", "src/to.ts"), "single", 1, ["src/from.ts", "src/to.ts"]),
      supportedCase("git rename with content edit", "git-style-diff", gitRenameWithContentEditPatch("src/from.ts", "src/to.ts", "from", "renamed"), "mixed", 2, ["src/from.ts", "src/to.ts"]),
      supportedCase("git mixed multi-file", "git-style-diff", gitMixedPatch(), "mixed", 4, ["src/a.ts", "src/new.ts", "src/remove.ts", "src/from.ts", "src/to.ts"]),
      supportedCase("fenced git single update", "model-output-with-prose", fencedGitPatch(gitUpdatePatch("src/a.ts", "a = 1", "a = 2")), "single", 1, ["src/a.ts"]),
      supportedCase("fenced git add file", "model-output-with-prose", fencedGitPatch(gitAddPatch("src/new.ts", "created"), "patch"), "single", 1, ["src/new.ts"]),
      supportedCase("fenced git delete file", "model-output-with-prose", fencedGitPatch(gitDeletePatch("src/remove.ts", "remove"), "text"), "single", 1, ["src/remove.ts"]),
      supportedCase("fenced git pure rename", "model-output-with-prose", fencedGitPatch(gitPureRenamePatch("src/from.ts", "src/to.ts"), ""), "single", 1, ["src/from.ts", "src/to.ts"]),
      supportedCase("fenced git rename with content edit", "model-output-with-prose", fencedGitPatch(gitRenameWithContentEditPatch("src/from.ts", "src/to.ts", "from", "renamed")), "mixed", 2, ["src/from.ts", "src/to.ts"]),
      supportedCase("fenced git mixed multi-file", "model-output-with-prose", fencedGitPatch(gitMixedPatch()), "mixed", 4, ["src/a.ts", "src/new.ts", "src/remove.ts", "src/from.ts", "src/to.ts"]),
      supportedCase("fenced git 32 update-only", "model-output-with-prose", fencedGitPatch(gitUpdatePatchBatch(32)), "update-only", 32, generatedUpdatePaths(32)),
      supportedCase("marker prose wrapped", "model-output-with-prose", proseWrappedMarkerPatch(), "single", 1, ["src/a.ts"]),
      supportedCase("marker fenced patch block", "model-output-with-prose", fencedMarkerPatch(), "single", 1, ["src/a.ts"]),
    ];

    for (const fixture of supported) {
      const projection = classifyBoundedApplyPatchCandidate({
        rawPatchText: fixture.patchText,
        workspaceRoot: "/workspace",
      });

      expect(projection, fixture.name).toEqual(
        expect.objectContaining({
          status: "candidate",
          operationCount: fixture.expectedOperationCount,
          operationFamily: fixture.expectedFamily,
          affectedPaths: fixture.expectedAffectedPaths,
        }),
      );
      if (projection.status === "candidate") {
        expect(projection.approvalPaths).toEqual(fixture.expectedAffectedPaths);
        expect(projection.evidence).toEqual(
          expect.arrayContaining([
            "bounded-apply-patch-candidate:routes-existing-small-n-writers",
            "bounded-apply-patch-candidate:no-broad-arbitrary-claim",
          ]),
        );
      }
    }
  });

  it("keeps realistic blocked broad, malformed, unsafe, over-cap, and boundary fixtures no-write", () => {
    const blocked: readonly FixtureCase[] = [
      blockedCase("33 operation patch", "marker-apply-patch", markerUpdateBatch(33), 33, "unsupportedTooManyOperations", generatedUpdatePaths(33)),
      blockedCase("arbitrary broad unsupported shape", "unsupported-metadata", gitCombinedDiffPatch(), 0, "unsupportedBroadShape", []),
      blockedCase("fuzzy-like missing exact context", "git-style-diff", gitNoNewlinePatch(), 0, "unsupportedBroadShape", []),
      blockedCase("binary patch", "unsupported-metadata", ["diff --git a/src/a.bin b/src/a.bin", "Binary files differ"].join("\n"), 0, "unsupportedDestructiveShape", []),
      blockedCase("mode patch", "unsupported-metadata", ["diff --git a/src/a.ts b/src/a.ts", "old mode 100644", "new mode 100755"].join("\n"), 0, "unsupportedDestructiveShape", []),
      blockedCase("symlink patch", "unsupported-metadata", gitModeBackedAddPatch("src/link", "120000"), 0, "unsupportedDestructiveShape", []),
      blockedCase("submodule patch", "unsupported-metadata", gitModeBackedAddPatch("vendor/lib", "160000"), 0, "unsupportedDestructiveShape", []),
      blockedCase("copy metadata", "unsupported-metadata", gitCopyPatch(), 0, "unsupportedBroadShape", []),
      blockedCase("directory delete", "marker-apply-patch", ["*** Begin Patch", "*** Delete File: src/dir/", "*** End Patch"].join("\n"), 1, "unsupportedDirectoryOperation", ["src/dir/"]),
      blockedCase("directory move", "marker-apply-patch", markerPureMovePatch("src/dir/", "src/other/"), 1, "unsupportedDirectoryOperation", ["src/dir/", "src/other/"]),
      blockedCase("overwrite path conflict", "marker-apply-patch", duplicateTargetPatch(), 2, "unsupportedPathConflict", ["src/a.ts"]),
      blockedCase("outside workspace path", "marker-apply-patch", outsideWorkspacePatch(), 1, "unsupportedWorkspaceBoundary", ["../outside.ts"]),
      blockedCase("malformed diff", "malformed", ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts"].join("\n"), 0, "unsupportedBroadShape", []),
      blockedCase("ambiguous hunk", "git-style-diff", ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "@@", "-a = 1", "+a = 2"].join("\n"), 0, "unsupportedBroadShape", []),
      blockedCase("index-only change", "unsupported-metadata", ["diff --git a/src/a.ts b/src/a.ts", "index 111..222 100644"].join("\n"), 0, "unsupportedBroadShape", []),
      blockedCase("unsupported newline-sensitive shape", "git-style-diff", gitNoNewlinePatch(), 0, "unsupportedBroadShape", []),
      blockedCase("rename-content over cap", "git-style-diff", [gitRenameWithContentEditPatch("src/from.ts", "src/to.ts", "from", "renamed"), gitUpdatePatchBatch(31)].join("\n"), 33, "unsupportedTooManyOperations", ["src/from.ts", "src/to.ts", ...generatedUpdatePaths(31)]),
      blockedCase("rename-content unsupported metadata", "unsupported-metadata", ["diff --git a/src/from.ts b/src/to.ts", "similarity index 100%", "rename from src/from.ts", "rename to src/to.ts", "old mode 100644", "new mode 100755", "--- a/src/from.ts", "+++ b/src/to.ts", "@@ -1 +1 @@", "-from", "+renamed"].join("\n"), 0, "unsupportedDestructiveShape", []),
      blockedCase("multiple fenced patch blocks", "model-output-with-prose", [fencedGitPatch(gitUpdatePatch("src/a.ts", "a = 1", "a = 2")), fencedGitPatch(gitUpdatePatch("src/b.ts", "b = 1", "b = 2"))].join("\n"), 0, "unsupportedBroadShape", []),
      blockedCase("incomplete fenced patch", "model-output-with-prose", ["```diff", gitUpdatePatch("src/a.ts", "a = 1", "a = 2")].join("\n"), 0, "unsupportedBroadShape", []),
      blockedCase("non-patch code fence", "model-output-with-prose", ["```ts", "const value = 1;", "```"].join("\n"), 0, "unsupportedFuzzyPatch", []),
      blockedCase("fenced 33 operation patch", "model-output-with-prose", fencedGitPatch(gitUpdatePatchBatch(33)), 33, "unsupportedTooManyOperations", generatedUpdatePaths(33)),
      blockedCase("fenced binary patch", "model-output-with-prose", fencedGitPatch(["diff --git a/src/a.bin b/src/a.bin", "Binary files differ"].join("\n")), 0, "unsupportedDestructiveShape", []),
      blockedCase("fenced mode patch", "model-output-with-prose", fencedGitPatch(["diff --git a/src/a.ts b/src/a.ts", "old mode 100644", "new mode 100755"].join("\n")), 0, "unsupportedDestructiveShape", []),
      blockedCase("fenced fuzzy/no-newline unsupported shape", "model-output-with-prose", fencedGitPatch(gitNoNewlinePatch()), 0, "unsupportedBroadShape", []),
      blockedCase("prose with two patch candidates", "model-output-with-prose", [gitUpdatePatch("src/a.ts", "a = 1", "a = 2"), fencedGitPatch(gitUpdatePatch("src/b.ts", "b = 1", "b = 2"))].join("\n"), 0, "unsupportedBroadShape", []),
    ];

    for (const fixture of blocked) {
      const projection = classifyBoundedApplyPatchCandidate({
        rawPatchText: fixture.patchText,
        workspaceRoot: "/workspace",
      });

      expect(projection, fixture.name).toEqual(
        expect.objectContaining({
          status: "unsupported",
          operationCount: fixture.expectedOperationCount,
          rejectionReason: fixture.expectedBlockedReason,
          affectedPaths: fixture.expectedAffectedPaths,
          evidence: expect.arrayContaining([
            "bounded-apply-patch-candidate:no-write-authority",
            "bounded-apply-patch-candidate:no-recovery-execution",
          ]),
        }),
      );
      expect(fixture.shouldRemainNoWrite).toBe(true);
    }
  });

  it("normalizes fenced git-style broad diffs through existing bounded extraction", () => {
    const result = normalizeBoundedBroadPatchText(
      ["```diff", gitUpdatePatch("src/a.ts", "a = 1", "a = 2"), "```"].join("\n"),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "normalized",
        operationCount: 1,
        affectedPaths: ["src/a.ts"],
        evidence: expect.arrayContaining([
          "fenced-patch-extractor:single-fenced-patch-extracted",
        ]),
      }),
    );
  });

  it("routes representative executable fixtures through guarded writers and preserves result fields", async () => {
    await expectExecutableRoute({
      name: "git rename-with-content-edit",
      patchText: gitRenameWithContentEditPatch("src/a.ts", "src/renamed.ts", "a = 1", "a = 2"),
      initialFiles: { "src/a.ts": "a = 1\n", "src/b.ts": "b = 1\n" },
      expectedChangedFiles: ["src/renamed.ts", "src/renamed.ts"],
      expectedSnapshot: { "src/b.ts": "b = 1\n", "src/renamed.ts": "a = 2\n" },
    });

    await expectExecutableRoute({
      name: "git mixed update/add/delete/move",
      patchText: gitMixedPatch(),
      initialFiles: {
        "src/a.ts": "a = 1\n",
        "src/remove.ts": "remove\n",
        "src/from.ts": "from\n",
      },
      expectedChangedFiles: ["src/a.ts", "src/new.ts", "src/remove.ts", "src/to.ts"],
      expectedSnapshot: { "src/a.ts": "a = 2\n", "src/new.ts": "created", "src/to.ts": "from\n" },
    });

    await expectExecutableRoute({
      name: "marker 32 update-only",
      patchText: markerUpdateBatch(32),
      initialFiles: Object.fromEntries(
        Array.from({ length: 32 }, (_, index) => [
          `src/file-${index + 1}.ts`,
          `file-${index + 1} = 1\n`,
        ]),
      ),
      expectedChangedFiles: generatedUpdatePaths(32),
      expectedSnapshot: Object.fromEntries(
        Array.from({ length: 32 }, (_, index) => [
          `src/file-${index + 1}.ts`,
          `file-${index + 1} = 2\n`,
        ]),
      ),
    });

    await expectExecutableRoute({
      name: "git delete-only",
      patchText: [gitDeletePatch("src/a.ts", "a = 1"), gitDeletePatch("src/b.ts", "b = 1")].join("\n"),
      initialFiles: { "src/a.ts": "a = 1\n", "src/b.ts": "b = 1\n" },
      expectedChangedFiles: ["src/a.ts", "src/b.ts"],
      expectedSnapshot: {},
    });

    await expectExecutableRoute({
      name: "fenced git single update",
      patchText: fencedGitPatch(gitUpdatePatch("src/a.ts", "a = 1", "a = 2")),
      initialFiles: { "src/a.ts": "a = 1\n" },
      expectedChangedFiles: ["src/a.ts"],
      expectedSnapshot: { "src/a.ts": "a = 2\n" },
    });

    await expectExecutableRoute({
      name: "fenced git mixed update/add/delete/move",
      patchText: fencedGitPatch(gitMixedPatch()),
      initialFiles: {
        "src/a.ts": "a = 1\n",
        "src/remove.ts": "remove\n",
        "src/from.ts": "from\n",
      },
      expectedChangedFiles: ["src/a.ts", "src/new.ts", "src/remove.ts", "src/to.ts"],
      expectedSnapshot: { "src/a.ts": "a = 2\n", "src/new.ts": "created", "src/to.ts": "from\n" },
    });
  });

  it("captures recovery authority for two executable gauntlet fixtures without automatic recovery", async () => {
    for (const [authorityId, patchText, initialFiles, firstRecordId] of [
      [
        "gauntlet-rename-content",
        gitRenameWithContentEditPatch("src/a.ts", "src/renamed.ts", "a = 1", "a = 2"),
        { "src/a.ts": "a = 1\n" },
        "move-1-src-a.ts",
      ],
      [
        "gauntlet-git-mixed",
        gitMixedPatch(),
        { "src/a.ts": "a = 1\n", "src/remove.ts": "remove\n", "src/from.ts": "from\n" },
        "update-1-src-a.ts",
      ],
    ] as const) {
      const fixture = createFixture(initialFiles);
      const ledgerRoot = createLedgerRoot();
      const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
      let firstWriterSawRecord = false;

      const result = await projectApplyPatchRuntimeMutationRoute({
        ...runtimeInput(fixture.workspaceRoot, patchText),
        routeOptions: {
          ...runtimeInput(fixture.workspaceRoot, patchText).routeOptions,
          recoveryAuthority: { mode: "non-default", ledgerRoot, authorityId },
        },
        getWorkspaceAuthority: () => ({
          ...authority,
          moveFileExclusive: async (sourcePath, targetPath) => {
            if (!firstWriterSawRecord) {
              firstWriterSawRecord = Boolean(
                await readRecoveryAuthorityRecord({
                  ledgerRoot,
                  authorityId,
                  recordId: firstRecordId,
                }),
              );
            }
            await authority.moveFileExclusive(sourcePath, targetPath);
          },
          writeFile: async (relativePath, content) => {
            if (!firstWriterSawRecord) {
              firstWriterSawRecord = Boolean(
                await readRecoveryAuthorityRecord({
                  ledgerRoot,
                  authorityId,
                  recordId: firstRecordId,
                }),
              );
            }
            await authority.writeFile(relativePath, content);
          },
        }),
        readNoWriteRuntimeFile: readWorkspaceFile(fixture.workspaceRoot),
      });

      expect(result?.status).toBe("completed");
      expect(result?.codingResult?.recoverySurface).toEqual(
        expect.objectContaining({
          recoveryAvailable: true,
          explicitRestoreAvailable: true,
          recoveryExecuted: false,
          atomicRollbackAvailable: false,
        }),
      );
      expect(firstWriterSawRecord).toBe(true);
    }
  });

  it("supports explicit restore for rename-content partial failure and blocks hidden edits", async () => {
    const fixture = createFixture({ "src/a.ts": "a = 1\n" });
    const ledgerRoot = createLedgerRoot();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const patchText = gitRenameWithContentEditPatch("src/a.ts", "src/renamed.ts", "a = 1", "a = 2");

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, patchText),
      routeOptions: {
        ...runtimeInput(fixture.workspaceRoot, patchText).routeOptions,
        recoveryAuthority: {
          mode: "non-default",
          ledgerRoot,
          authorityId: "gauntlet-rename-content-restore",
        },
      },
      getWorkspaceAuthority: () => ({
        ...authority,
        writeFile: () => {
          throw new Error("simulated update failure");
        },
      }),
      readNoWriteRuntimeFile: readWorkspaceFile(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.codingResult?.changedFiles).toEqual(["src/renamed.ts"]);
    expect(result?.codingResult?.failedFiles).toEqual([
      expect.objectContaining({ path: "src/renamed.ts" }),
    ]);
    expect(result?.codingResult?.recoverySurface).toEqual(
      expect.objectContaining({
        recoveryExecuted: false,
        atomicRollbackAvailable: false,
      }),
    );

    const restore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "gauntlet-rename-content-restore",
      recordId: "move-target-1-src-renamed.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/renamed.ts",
    });
    expect(restore.restored).toBe(true);
    expect(restore.rollbackAtomicityClaim).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/renamed.ts")).toBeUndefined();

    fs.writeFileSync(path.join(fixture.workspaceRoot, "src", "renamed.ts"), "hidden\n", "utf8");
    const blocked = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "gauntlet-rename-content-restore",
      recordId: "move-target-1-src-renamed.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/renamed.ts",
    });
    expect(blocked.restored).toBe(false);
    expect(blocked.blockedReason).toBe("current-content-hash-mismatch");
  });

  it("represents a 32-operation mixed partial failure prefix and restores explicit records only", async () => {
    const fixture = createFixture(generatedMixedFiles(32));
    const ledgerRoot = createLedgerRoot();
    const authority = createWorkspaceWriteAuthority(fixture.workspaceRoot);
    const patchText = markerGeneratedMixedPatch(32);

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, patchText),
      routeOptions: {
        ...runtimeInput(fixture.workspaceRoot, patchText).routeOptions,
        recoveryAuthority: {
          mode: "non-default",
          ledgerRoot,
          authorityId: "gauntlet-32-mixed-restore",
        },
      },
      getWorkspaceAuthority: () => ({
        ...authority,
        deleteFile: (relativePath) => {
          if (relativePath === "src/delete-32.ts") {
            throw new Error("simulated final delete failure");
          }
          authority.deleteFile(relativePath);
        },
      }),
      readNoWriteRuntimeFile: readWorkspaceFile(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.codingResult?.changedFiles).toHaveLength(31);
    expect(result?.codingResult?.failedFiles).toEqual([
      expect.objectContaining({ path: "src/delete-32.ts" }),
    ]);
    expect(result?.codingResult?.recoverySurface).toEqual(
      expect.objectContaining({
        recoveryExecuted: false,
        atomicRollbackAvailable: false,
      }),
    );

    const restore = await restoreRecoveryAuthorityRecord({
      ledgerRoot,
      authorityId: "gauntlet-32-mixed-restore",
      recordId: "update-1-src-update-1.ts",
      workspaceRoot: fixture.workspaceRoot,
      workspaceRelativePath: "src/update-1.ts",
    });
    expect(restore.restored).toBe(true);
    expect(restore.rollbackAtomicityClaim).toBe(false);
    expect(readFile(fixture.workspaceRoot, "src/update-1.ts")).toBe("update-1 = 1\n");
  });

  it("keeps blocked fixtures without recovery authority, restore preview, writer, or changed files", async () => {
    const fixture = createFixture(
      Object.fromEntries(
        Array.from({ length: 33 }, (_, index) => [
          `src/file-${index + 1}.ts`,
          `file-${index + 1} = 1\n`,
        ]),
      ),
    );
    const before = snapshotFixture(fixture.workspaceRoot);
    let writes = 0;

    const result = await projectApplyPatchRuntimeMutationRoute({
      ...runtimeInput(fixture.workspaceRoot, markerUpdateBatch(33)),
      routeOptions: {
        ...runtimeInput(fixture.workspaceRoot, markerUpdateBatch(33)).routeOptions,
        recoveryAuthority: {
          mode: "non-default",
          ledgerRoot: createLedgerRoot(),
          authorityId: "gauntlet-blocked-over-cap",
        },
      },
      getWorkspaceAuthority: () => blockedAuthority(fixture.workspaceRoot, () => {
        writes += 1;
      }),
      readNoWriteRuntimeFile: readWorkspaceFile(fixture.workspaceRoot),
    });

    expect(result?.status).toBe("stopped_error");
    expect(result?.codingResult?.changedFiles).toEqual([]);
    expect(result?.codingResult?.perFilePatchPlan).toEqual(
      expect.objectContaining({
        supportStatus: "unsupported-no-write",
        writerInvoked: false,
        creatorInvoked: false,
        deleteMoveInvoked: false,
        postWriteVerification: "not-run",
        successLike: false,
      }),
    );
    expect(result?.codingResult?.recoverySurface).toBeUndefined();
    expect(writes).toBe(0);
    expect(snapshotFixture(fixture.workspaceRoot)).toEqual(before);
  });
});

function supportedCase(
  name: string,
  sourceKind: FixtureCase["sourceKind"],
  patchText: string,
  expectedFamily: Exclude<FixtureCase["expectedFamily"], "unsupported">,
  expectedOperationCount: number,
  expectedAffectedPaths: readonly string[],
): FixtureCase {
  return {
    name,
    sourceKind,
    patchText,
    expectedStatus: "supported",
    expectedFamily,
    expectedOperationCount,
    expectedAffectedPaths,
    shouldReachRouting: true,
    shouldCaptureRecoveryAuthority: true,
    shouldRemainNoWrite: false,
  };
}

function blockedCase(
  name: string,
  sourceKind: FixtureCase["sourceKind"],
  patchText: string,
  expectedOperationCount: number,
  expectedBlockedReason: string,
  expectedAffectedPaths: readonly string[],
): FixtureCase {
  return {
    name,
    sourceKind,
    patchText,
    expectedStatus: "blocked",
    expectedFamily: "unsupported",
    expectedOperationCount,
    expectedBlockedReason,
    expectedAffectedPaths,
    shouldReachRouting: false,
    shouldCaptureRecoveryAuthority: false,
    shouldRemainNoWrite: true,
  };
}

async function expectExecutableRoute(input: {
  readonly name: string;
  readonly patchText: string;
  readonly initialFiles: Record<string, string>;
  readonly expectedChangedFiles: readonly string[];
  readonly expectedSnapshot: Record<string, string>;
}) {
  const fixture = createFixture(input.initialFiles);
  const result = await projectApplyPatchRuntimeMutationRoute({
    ...runtimeInput(fixture.workspaceRoot, input.patchText),
    getWorkspaceAuthority: () => createWorkspaceWriteAuthority(fixture.workspaceRoot),
    readNoWriteRuntimeFile: readWorkspaceFile(fixture.workspaceRoot),
  });

  expect(result?.status, input.name).toBe("completed");
  expect(result?.terminalClassification, input.name).toBe("success");
  expect(result?.codingResult?.changedFiles, input.name).toEqual(input.expectedChangedFiles);
  expect(result?.codingResult?.failedFiles, input.name).toEqual([]);
  expect(result?.codingResult?.perFilePatchPlan, input.name).toEqual(
    expect.objectContaining({
      supportStatus: "supported-write",
      changedFiles: input.expectedChangedFiles,
      failedFiles: [],
      writerInvoked: true,
      postWriteVerification: "passed",
      successLike: true,
    }),
  );
  expect(result?.codingResult?.recoverySurface, input.name).toBeUndefined();
  expect(snapshotFixture(fixture.workspaceRoot), input.name).toEqual(input.expectedSnapshot);
}

function runtimeInput(workspaceRoot: string, rawPatchText: string) {
  return {
    sessionId: "session-1",
    prompt: rawPatchText,
    workspaceRoot,
    routeOptions: {
      explicitRuntimeOptIn: true,
      rawPatchText,
      requestedUserDecision: "approved" as const,
      workspaceWrite: {
        explicitWorkspaceWriteOptIn: true,
      },
    },
    getWorkspaceAuthority: () => createWorkspaceWriteAuthority(workspaceRoot),
    readNoWriteRuntimeFile: readWorkspaceFile(workspaceRoot),
  };
}

function blockedAuthority(workspaceRoot: string, onWrite: () => void) {
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  return {
    ...authority,
    writeFile: () => {
      onWrite();
      throw new Error("writer must not be invoked");
    },
    createFileExclusive: () => {
      onWrite();
      throw new Error("creator must not be invoked");
    },
    moveFileExclusive: () => {
      onWrite();
      throw new Error("move writer must not be invoked");
    },
    deleteFile: () => {
      onWrite();
      throw new Error("delete writer must not be invoked");
    },
  };
}

function createFixture(files: Record<string, string> = { "src/a.ts": "a = 1\n", "src/b.ts": "b = 1\n" }) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "edit-gauntlet-"));
  tempRoots.push(workspaceRoot);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
  return { workspaceRoot };
}

function createLedgerRoot(): string {
  const ledgerRoot = fs.mkdtempSync(path.join(os.tmpdir(), "edit-gauntlet-ledger-"));
  tempRoots.push(ledgerRoot);
  return ledgerRoot;
}

function readWorkspaceFile(workspaceRoot: string) {
  return (absolutePath: string): string | undefined => {
    try {
      const relative = path.relative(workspaceRoot, absolutePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        return undefined;
      }
      return fs.readFileSync(absolutePath, "utf8");
    } catch {
      return undefined;
    }
  };
}

function readFile(workspaceRoot: string, relativePath: string): string | undefined {
  try {
    return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
  } catch {
    return undefined;
  }
}

function snapshotFixture(workspaceRoot: string): Record<string, string> {
  const output: Record<string, string> = {};
  function visit(directory: string) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      output[path.relative(workspaceRoot, absolutePath).replaceAll("\\", "/")] =
        fs.readFileSync(absolutePath, "utf8");
    }
  }
  visit(workspaceRoot);
  return output;
}

function markerUpdatePatch(): string {
  return ["*** Begin Patch", "*** Update File: src/a.ts", "@@", "-a = 1", "+a = 2", "*** End Patch"].join("\n");
}

function markerAddPatch(filePath: string, content: string): string {
  return ["*** Begin Patch", `*** Add File: ${filePath}`, `+${content}`, "*** End Patch"].join("\n");
}

function markerDeletePatch(filePath: string): string {
  return ["*** Begin Patch", `*** Delete File: ${filePath}`, "*** End Patch"].join("\n");
}

function markerPureMovePatch(fromPath: string, toPath: string): string {
  return ["*** Begin Patch", `*** Update File: ${fromPath}`, `*** Move to: ${toPath}`, "@@", " unchanged", "*** End Patch"].join("\n");
}

function markerUpdateBatch(count: number): string {
  return [
    "*** Begin Patch",
    ...Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      return [`*** Update File: src/file-${number}.ts`, "@@", `-file-${number} = 1`, `+file-${number} = 2`];
    }).flat(),
    "*** End Patch",
  ].join("\n");
}

function markerMixedPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Add File: src/new.ts",
    "+created",
    "*** Delete File: src/remove.ts",
    "*** Update File: src/from.ts",
    "*** Move to: src/to.ts",
    "@@",
    " from",
    "*** End Patch",
  ].join("\n");
}

function markerGeneratedMixedPatch(count: number): string {
  return [
    "*** Begin Patch",
    ...Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      if (number % 4 === 0) {
        return [`*** Delete File: src/delete-${number}.ts`];
      }
      return [`*** Update File: src/update-${number}.ts`, "@@", `-update-${number} = 1`, `+update-${number} = 2`];
    }).flat(),
    "*** End Patch",
  ].join("\n");
}

function generatedMixedFiles(count: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      if (number % 4 === 0) {
        return [`src/delete-${number}.ts`, `delete-${number}\n`];
      }
      return [`src/update-${number}.ts`, `update-${number} = 1\n`];
    }),
  );
}

function proseWrappedMarkerPatch(): string {
  return ["I will apply this patch.", markerUpdatePatch(), "No other files are needed."].join("\n");
}

function fencedMarkerPatch(): string {
  return ["```diff", markerUpdatePatch(), "```"].join("\n");
}

function fencedGitPatch(patchText: string, language = "diff"): string {
  return [`\`\`\`${language}`, patchText, "```"].join("\n");
}

function gitUpdatePatch(filePath: string, oldLine: string, newLine: string): string {
  return [`diff --git a/${filePath} b/${filePath}`, `--- a/${filePath}`, `+++ b/${filePath}`, "@@ -1 +1 @@", `-${oldLine}`, `+${newLine}`].join("\n");
}

function gitUpdatePatchBatch(count: number): string {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return gitUpdatePatch(`src/file-${number}.ts`, `file-${number} = 1`, `file-${number} = 2`);
  }).join("\n");
}

function gitMultiHunkPatch(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,2 @@",
    " keep",
    "-a = 1",
    "+a = 2",
    "@@ -8,2 +8,2 @@",
    " keep",
    "-b = 1",
    "+b = 2",
  ].join("\n");
}

function gitAddPatch(filePath: string, content: string): string {
  return [`diff --git a/${filePath} b/${filePath}`, "new file mode 100644", "--- /dev/null", `+++ b/${filePath}`, "@@ -0,0 +1 @@", `+${content}`].join("\n");
}

function gitDeletePatch(filePath: string, content: string): string {
  return [`diff --git a/${filePath} b/${filePath}`, "deleted file mode 100644", `--- a/${filePath}`, "+++ /dev/null", "@@ -1 +0,0 @@", `-${content}`].join("\n");
}

function gitPureRenamePatch(fromPath: string, toPath: string): string {
  return [`diff --git a/${fromPath} b/${toPath}`, "similarity index 100%", `rename from ${fromPath}`, `rename to ${toPath}`].join("\n");
}

function gitRenameWithContentEditPatch(fromPath: string, toPath: string, oldLine: string, newLine: string): string {
  return [`diff --git a/${fromPath} b/${toPath}`, "similarity index 100%", `rename from ${fromPath}`, `rename to ${toPath}`, `--- a/${fromPath}`, `+++ b/${toPath}`, "@@ -1 +1 @@", `-${oldLine}`, `+${newLine}`].join("\n");
}

function gitMixedPatch(): string {
  return [
    gitUpdatePatch("src/a.ts", "a = 1", "a = 2"),
    gitAddPatch("src/new.ts", "created"),
    gitDeletePatch("src/remove.ts", "remove"),
    gitPureRenamePatch("src/from.ts", "src/to.ts"),
  ].join("\n");
}

function gitModeBackedAddPatch(filePath: string, mode: string): string {
  return [`diff --git a/${filePath} b/${filePath}`, `new file mode ${mode}`, "--- /dev/null", `+++ b/${filePath}`, "@@ -0,0 +1 @@", "+target"].join("\n");
}

function gitCopyPatch(): string {
  return ["diff --git a/src/a.ts b/src/b.ts", "similarity index 100%", "copy from src/a.ts", "copy to src/b.ts"].join("\n");
}

function gitCombinedDiffPatch(): string {
  return ["diff --combined src/a.ts", "index 111,222..333", "--- a/src/a.ts", "+++ b/src/a.ts", "@@@ -1,1 -1,1 +1,1 @@@", "-a = 1", "+a = 2"].join("\n");
}

function gitNoNewlinePatch(): string {
  return ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1 +1 @@", "-a = 1", "\\ No newline at end of file", "+a = 2"].join("\n");
}

function duplicateTargetPatch(): string {
  return ["*** Begin Patch", "*** Update File: src/a.ts", "@@", "-a = 1", "+a = 2", "*** Update File: src/a.ts", "@@", "-a = 2", "+a = 3", "*** End Patch"].join("\n");
}

function outsideWorkspacePatch(): string {
  return ["*** Begin Patch", "*** Update File: ../outside.ts", "@@", "-outside = 1", "+outside = 2", "*** End Patch"].join("\n");
}

function generatedUpdatePaths(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `src/file-${index + 1}.ts`);
}
