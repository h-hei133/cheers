import { describe, expect, it } from "vitest";
import { classifyBoundedApplyPatchCandidate } from "./boundedApplyPatchCandidate.js";

describe("bounded apply_patch candidate classifier", () => {
  it("classifies single update/create/delete/move operations as existing single-route candidates", () => {
    for (const [patchText, kind, targetPath] of [
      [singleUpdatePatch(), "update", "src/a.ts"],
      [singleCreatePatch(), "create", "src/new.ts"],
      [singleDeletePatch(), "delete", "src/a.ts"],
      [singleMovePatch(), "move", "src/moved.ts"],
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
          approvalPaths: [targetPath],
        }),
      );
      expect(projection.normalizedOperations[0]).toEqual(
        expect.objectContaining({ kind, targetPath }),
      );
    }
  });

  it("classifies 2, 5, and 8 operation supported families", () => {
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
        rawPatchText: mixedPatch(8),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 8,
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
        rawPatchText: movePatch(8),
        workspaceRoot: "/workspace",
      }),
    ).toEqual(
      expect.objectContaining({
        status: "candidate",
        operationCount: 8,
        operationFamily: "move-only",
      }),
    );
  });

  it("blocks 9+ update and mixed candidates without write authority", () => {
    for (const patchText of [updatePatch(9), mixedPatch(9)]) {
      expect(
        classifyBoundedApplyPatchCandidate({
          rawPatchText: patchText,
          workspaceRoot: "/workspace",
        }),
      ).toEqual(
        expect.objectContaining({
          status: "unsupported",
          operationCount: 9,
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
