import { describe, expect, it } from "vitest";
import { classifyBoundedApplyPatchCandidate } from "./candidate.js";

describe("bounded apply_patch candidate classifier", () => {
  it("classifies single update/create/delete/move operations as existing single-route candidates", () => {
    for (const [patchText, kind, targetPath, approvalPaths] of [
      [singleUpdatePatch(), "update", "src/a.ts", ["src/a.ts"]],
      [singleCreatePatch(), "create", "src/new.ts", ["src/new.ts"]],
      [singleDeletePatch(), "delete", "src/a.ts", ["src/a.ts"]],
      [singleMovePatch(), "move", "src/moved.ts", ["src/a.ts", "src/moved.ts"]],
    ] as const) {
      const projection = classifyBoundedApplyPatchCandidate({
        rawPatchText: patchText,
        workspaceRoot: "/workspace",
      });

      expect(projection).toEqual(
        expect.objectContaining({
          status: "candidate",
          operationCount: 1,
          operationFamily: "single",
          approvalPaths,
        }),
      );
      expect(projection.normalizedOperations[0]).toEqual(
        expect.objectContaining({ kind, targetPath }),
      );
    }
  });

  it("classifies 2, 5, 8, 9, 16, and 32 operation supported families", () => {
    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: updatePatch(5),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 5,
        operationFamily: "update-only",
      }),
    );

    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: updatePatch(32),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 32,
        operationFamily: "update-only",
      }),
    );

    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: mixedPatch(16),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 16,
        operationFamily: "mixed",
      }),
    );

    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: deletePatch(2),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 2,
        operationFamily: "delete-only",
      }),
    );

    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: deletePatch(9),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 9,
        operationFamily: "delete-only",
      }),
    );

    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: movePatch(32),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 32,
        operationFamily: "move-only",
      }),
    );
  });

  it("blocks 33+ update and mixed candidates without write authority", () => {
    for (const patchText of [updatePatch(33), mixedPatch(33)]) {
      expect(
        classifyBoundedApplyPatchCandidate({
          rawPatchText: patchText,
          workspaceRoot: "/workspace",
        }),
      ).toEqual(
        expect.objectContaining({
          status: "unsupported",
          operationCount: 33,
          rejectionReason: "unsupportedTooManyOperations",
          evidence: expect.arrayContaining([
            "bounded-apply-patch-candidate:no-write-authority",
          ]),
        }),
      );
    }
  });

  it("classifies safe git-style broad diff as normalized bounded candidates", () => {
    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: [
          "diff --git a/src/a.ts b/src/a.ts",
          "--- a/src/a.ts",
          "+++ b/src/a.ts",
          "@@ -1 +1 @@",
          "-a = 1",
          "+a = 2",
        ].join("\n"),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 1,
        operationFamily: "single",
        normalizedRawPatchText: expect.stringContaining(
          "*** Update File: src/a.ts",
        ),
        evidence: expect.arrayContaining([
          "bounded-apply-patch-candidate:broad-patch-normalized",
        ]),
      }),
    );
  });

  it("classifies fenced git-style broad diffs through the existing bounded route contract", () => {
    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: [
          "Here is the patch:",
          "```diff",
          "diff --git a/src/a.ts b/src/a.ts",
          "--- a/src/a.ts",
          "+++ b/src/a.ts",
          "@@ -1 +1 @@",
          "-a = 1",
          "+a = 2",
          "```",
        ].join("\n"),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 1,
        operationFamily: "single",
        affectedPaths: ["src/a.ts"],
        normalizedRawPatchText: expect.stringContaining(
          "*** Update File: src/a.ts",
        ),
        evidence: expect.arrayContaining([
          "fenced-patch-extractor:single-fenced-patch-extracted",
          "bounded-apply-patch-candidate:broad-patch-normalized",
          "bounded-apply-patch-candidate:no-broad-arbitrary-claim",
        ]),
      }),
    );
  });

  it("classifies safe git-style rename-with-content-edit as decomposed bounded mixed candidate", () => {
    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: renameWithContentEditPatch(),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 2,
        operationFamily: "mixed",
        affectedPaths: ["src/a.ts", "src/b.ts"],
        approvalPaths: ["src/a.ts", "src/b.ts"],
        normalizedOperations: [
          { kind: "move", sourcePath: "src/a.ts", targetPath: "src/b.ts" },
          { kind: "update", targetPath: "src/b.ts" },
        ],
        normalizedRawPatchText: expect.stringContaining(
          "*** Update File: src/b.ts",
        ),
      }),
    );
  });

  it("blocks unsupported broad shapes, path conflicts, outside-workspace, directory, and content-edit move shapes", () => {
    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: [
          "diff --git a/src/a.bin b/src/a.bin",
          "Binary files differ",
        ].join("\n"),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "unsupported",
        rejectionReason: "unsupportedDestructiveShape",
      }),
    );

    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: duplicateTargetPatch(),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "unsupported",
        rejectionReason: "unsupportedPathConflict",
      }),
    );

    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: outsideWorkspacePatch(),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "unsupported",
        rejectionReason: "unsupportedWorkspaceBoundary",
      }),
    );

    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: [
          "*** Begin Patch",
          "*** Delete File: src/dir/",
          "*** End Patch",
        ].join("\n"),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "unsupported",
        rejectionReason: "unsupportedDirectoryOperation",
      }),
    );

    expect(
      classifyBoundedApplyPatchCandidate({
        rawPatchText: [
          "*** Begin Patch",
          "*** Update File: src/a.ts",
          "*** Move to: src/b.ts",
          "@@",
          "-a = 1",
          "+a = 2",
          "*** End Patch",
        ].join("\n"),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "unsupported",
        rejectionReason: "unsupportedDestructiveShape",
      }),
    );
  });

  it("covers a realistic broad patch fixture gauntlet without authorizing writes", () => {
    const supported = [
      { patchText: gitUpdatePatchBatch(["a", "b"]), count: 2, family: "update-only" },
      { patchText: [gitAddPatch("src/new.ts", "created"), gitDeletePatch("src/old.ts", "old")].join("\n"), count: 2, family: "mixed" },
      { patchText: gitPureRenamePatch("src/from.ts", "src/to.ts"), count: 1, family: "single" },
      { patchText: renameWithContentEditPatch(), count: 2, family: "mixed" },
      { patchText: gitUpdatePatchBatch(Array.from({ length: 32 }, (_, index) => `file-${index + 1}`)), count: 32, family: "update-only" },
      { patchText: mixedBroadPatch(), count: 4, family: "mixed" },
      { patchText: multiHunkGitPatch(), count: 1, family: "single" },
    ] as const;

    for (const fixture of supported) {
      expect(
        classifyBoundedApplyPatchCandidate({
          rawPatchText: fixture.patchText,
          workspaceRoot: "/workspace",
        }),
      ).toEqual(
        expect.objectContaining({
          status: "candidate",
          operationCount: fixture.count,
          operationFamily: fixture.family,
          evidence: expect.arrayContaining([
            "bounded-apply-patch-candidate:broad-patch-normalized",
            "bounded-apply-patch-candidate:no-broad-arbitrary-claim",
          ]),
        }),
      );
    }

    const blocked = [
      { patchText: gitUpdatePatchBatch(Array.from({ length: 33 }, (_, index) => `file-${index + 1}`)), reason: "unsupportedTooManyOperations" },
      { patchText: binaryBroadPatch(), reason: "unsupportedDestructiveShape" },
      { patchText: modeBroadPatch(), reason: "unsupportedDestructiveShape" },
      { patchText: symlinkBroadPatch(), reason: "unsupportedDestructiveShape" },
      { patchText: submoduleBroadPatch(), reason: "unsupportedDestructiveShape" },
      { patchText: copyBroadPatch(), reason: "unsupportedBroadShape" },
      { patchText: malformedBroadPatch(), reason: "unsupportedBroadShape" },
      { patchText: ambiguousHunkBroadPatch(), reason: "unsupportedBroadShape" },
      { patchText: fuzzyLikeBroadPatch(), reason: "unsupportedBroadShape" },
      { patchText: directoryBroadPatch(), reason: "unsupportedDirectoryOperation" },
      { patchText: duplicateTargetPatch(), reason: "unsupportedPathConflict" },
      { patchText: outsideWorkspaceGitPatch(), reason: "unsupportedWorkspaceBoundary" },
      { patchText: fencedPatch(gitUpdatePatchBatch(["a"]), "diff", true), reason: "unsupportedBroadShape" },
    ] as const;

    for (const fixture of blocked) {
      expect(
        classifyBoundedApplyPatchCandidate({
          rawPatchText: fixture.patchText,
          workspaceRoot: "/workspace",
        }),
      ).toEqual(
        expect.objectContaining({
          status: "unsupported",
          rejectionReason: fixture.reason,
          evidence: expect.arrayContaining([
            "bounded-apply-patch-candidate:no-write-authority",
            "bounded-apply-patch-candidate:no-recovery-execution",
          ]),
        }),
      );
    }
  });
});

function singleUpdatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** End Patch",
  ].join("\n");
}

function singleCreatePatch(): string {
  return [
    "*** Begin Patch",
    "*** Add File: src/new.ts",
    "+created",
    "*** End Patch",
  ].join("\n");
}

function singleDeletePatch(): string {
  return [
    "*** Begin Patch",
    "*** Delete File: src/a.ts",
    "*** End Patch",
  ].join("\n");
}

function singleMovePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "*** Move to: src/moved.ts",
    "@@",
    " a = 1",
    "*** End Patch",
  ].join("\n");
}

function updatePatch(count: number): string {
  return [
    "*** Begin Patch",
    ...Array.from({ length: count }, (_, index) => {
      const name = `file-${index + 1}`;
      return [
        `*** Update File: src/${name}.ts`,
        "@@",
        `-${name} = 1`,
        `+${name} = 2`,
      ];
    }).flat(),
    "*** End Patch",
  ].join("\n");
}

function deletePatch(count: number): string {
  return [
    "*** Begin Patch",
    ...Array.from(
      { length: count },
      (_, index) => `*** Delete File: src/delete-${index + 1}.ts`,
    ),
    "*** End Patch",
  ].join("\n");
}

function movePatch(count: number): string {
  return [
    "*** Begin Patch",
    ...Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      return [
        `*** Update File: src/move-${number}.ts`,
        `*** Move to: src/moved-${number}.ts`,
        "@@",
        ` move-${number} = 1`,
      ];
    }).flat(),
    "*** End Patch",
  ].join("\n");
}

function mixedPatch(count: number): string {
  return [
    "*** Begin Patch",
    ...Array.from({ length: count }, (_, index) => {
      const number = index + 1;
      if (index % 2 === 0) {
        return [
          `*** Update File: src/update-${number}.ts`,
          "@@",
          `-update-${number} = 1`,
          `+update-${number} = 2`,
        ];
      }
      return [`*** Delete File: src/delete-${number}.ts`];
    }).flat(),
    "*** End Patch",
  ].join("\n");
}

function gitUpdatePatch(fileStem: string): string {
  return [
    `diff --git a/src/${fileStem}.ts b/src/${fileStem}.ts`,
    `--- a/src/${fileStem}.ts`,
    `+++ b/src/${fileStem}.ts`,
    "@@ -1 +1 @@",
    `-${fileStem} = 1`,
    `+${fileStem} = 2`,
  ].join("\n");
}

function gitUpdatePatchBatch(files: readonly string[]): string {
  return files.map(gitUpdatePatch).join("\n");
}

function gitAddPatch(filePath: string, content: string): string {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${filePath}`,
    "@@ -0,0 +1 @@",
    `+${content}`,
  ].join("\n");
}

function gitDeletePatch(filePath: string, content: string): string {
  return [
    `diff --git a/${filePath} b/${filePath}`,
    "deleted file mode 100644",
    `--- a/${filePath}`,
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    `-${content}`,
  ].join("\n");
}

function gitPureRenamePatch(fromPath: string, toPath: string): string {
  return [
    `diff --git a/${fromPath} b/${toPath}`,
    "similarity index 100%",
    `rename from ${fromPath}`,
    `rename to ${toPath}`,
  ].join("\n");
}

function mixedBroadPatch(): string {
  return [
    gitUpdatePatch("a"),
    gitAddPatch("src/new.ts", "created"),
    gitDeletePatch("src/old.ts", "old"),
    gitPureRenamePatch("src/from.ts", "src/to.ts"),
  ].join("\n");
}

function multiHunkGitPatch(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,2 @@",
    " keep one",
    "-a = 1",
    "+a = 2",
    "@@ -8,2 +8,2 @@",
    " keep two",
    "-b = 1",
    "+b = 2",
  ].join("\n");
}

function duplicateTargetPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 2",
    "+a = 3",
    "*** End Patch",
  ].join("\n");
}

function outsideWorkspacePatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: ../outside.ts",
    "@@",
    "-outside = 1",
    "+outside = 2",
    "*** End Patch",
  ].join("\n");
}

function renameWithContentEditPatch(): string {
  return [
    "diff --git a/src/a.ts b/src/b.ts",
    "similarity index 100%",
    "rename from src/a.ts",
    "rename to src/b.ts",
    "--- a/src/a.ts",
    "+++ b/src/b.ts",
    "@@ -1 +1 @@",
    "-a = 1",
    "+a = 2",
  ].join("\n");
}

function binaryBroadPatch(): string {
  return ["diff --git a/src/a.bin b/src/a.bin", "Binary files differ"].join("\n");
}

function modeBroadPatch(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "old mode 100644",
    "new mode 100755",
  ].join("\n");
}

function symlinkBroadPatch(): string {
  return [
    "diff --git a/src/link b/src/link",
    "new file mode 120000",
    "--- /dev/null",
    "+++ b/src/link",
    "@@ -0,0 +1 @@",
    "+target",
  ].join("\n");
}

function submoduleBroadPatch(): string {
  return [
    "diff --git a/vendor/lib b/vendor/lib",
    "new file mode 160000",
    "--- /dev/null",
    "+++ b/vendor/lib",
    "@@ -0,0 +1 @@",
    "+160000",
  ].join("\n");
}

function copyBroadPatch(): string {
  return [
    "diff --git a/src/a.ts b/src/b.ts",
    "similarity index 100%",
    "copy from src/a.ts",
    "copy to src/b.ts",
  ].join("\n");
}

function malformedBroadPatch(): string {
  return ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts"].join("\n");
}

function ambiguousHunkBroadPatch(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
  ].join("\n");
}

function fuzzyLikeBroadPatch(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1 +1 @@",
    "-a = 1",
    "\\ No newline at end of file",
    "+a = 2",
  ].join("\n");
}

function directoryBroadPatch(): string {
  return [
    "diff --git a/src/dir/ b/src/dir/",
    "--- a/src/dir/",
    "+++ b/src/dir/",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n");
}

function outsideWorkspaceGitPatch(): string {
  return [
    "diff --git a/../outside.ts b/../outside.ts",
    "--- a/../outside.ts",
    "+++ b/../outside.ts",
    "@@ -1 +1 @@",
    "-outside = 1",
    "+outside = 2",
  ].join("\n");
}

function fencedPatch(
  patchText: string,
  language = "diff",
  duplicate = false,
): string {
  const fence = [`\`\`\`${language}`, patchText, "```"].join("\n");
  return duplicate ? [fence, fence].join("\n") : fence;
}
