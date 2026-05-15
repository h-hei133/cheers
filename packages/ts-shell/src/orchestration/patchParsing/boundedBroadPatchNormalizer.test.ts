import { describe, expect, it } from "vitest";
import { normalizeBoundedBroadPatchText } from "./boundedBroadPatchNormalizer.js";

describe("normalizeBoundedBroadPatchText", () => {
  it("normalizes git-style update, add, delete, and pure rename sections", () => {
    const result = normalizeBoundedBroadPatchText(
      [
        "diff --git a/src/a.ts b/src/a.ts",
        "index 111..222 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1 +1 @@",
        "-a = 1",
        "+a = 2",
        "diff --git a/src/new.ts b/src/new.ts",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/src/new.ts",
        "@@ -0,0 +1 @@",
        "+created",
        "diff --git a/src/old.ts b/src/old.ts",
        "deleted file mode 100644",
        "--- a/src/old.ts",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-old",
        "diff --git a/src/from.ts b/src/to.ts",
        "similarity index 100%",
        "rename from src/from.ts",
        "rename to src/to.ts",
      ].join("\n"),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "normalized",
        operationCount: 4,
        affectedPaths: [
          "src/a.ts",
          "src/new.ts",
          "src/old.ts",
          "src/from.ts",
          "src/to.ts",
        ],
      }),
    );
    expect(Boolean(result.status === "normalized" && result.normalizedRawPatchText)).toBe(
      true,
    );
    if (result.status === "normalized") {
      expect(result.normalizedOperations.map((operation) => operation.kind)).toEqual(
        ["update", "add", "delete", "move"],
      );
      expect(result.normalizedRawPatchText).toContain(
        "*** Update File: src/a.ts",
      );
      expect(result.normalizedRawPatchText).toContain(
        "*** Add File: src/new.ts",
      );
      expect(result.normalizedRawPatchText).toContain(
        "*** Delete File: src/old.ts",
      );
      expect(result.normalizedRawPatchText).toContain(
        "*** Move to: src/to.ts",
      );
    }
  });

  it("normalizes exactly 32 operations and leaves the count boundary to candidate routing", () => {
    const result = normalizeBoundedBroadPatchText(
      Array.from({ length: 32 }, (_, index) => {
        const file = `src/file-${index + 1}.ts`;
        return [
          `diff --git a/${file} b/${file}`,
          `--- a/${file}`,
          `+++ b/${file}`,
          "@@ -1 +1 @@",
          `-value = ${index}`,
          `+value = ${index + 1}`,
        ].join("\n");
      }).join("\n"),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "normalized",
        operationCount: 32,
      }),
    );
  });

  it("extracts a single fenced git-style broad diff before normalization", () => {
    const result = normalizeBoundedBroadPatchText(
      [
        "Apply this diff:",
        "```diff",
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1 +1 @@",
        "-a = 1",
        "+a = 2",
        "```",
      ].join("\n"),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "normalized",
        operationCount: 1,
        affectedPaths: ["src/a.ts"],
        evidence: expect.arrayContaining([
          "fenced-patch-extractor:single-fenced-patch-extracted",
          "bounded-broad-patch-normalizer:git-unified-diff-normalized",
        ]),
      }),
    );
  });

  it("preserves multi-hunk updates as exact marker hunks", () => {
    const result = normalizeBoundedBroadPatchText(
      [
        "diff --git a/src/a.ts b/src/a.ts",
        "index 111..222 100644",
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
      ].join("\n"),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "normalized",
        operationCount: 1,
      }),
    );
    if (result.status === "normalized") {
      expect(result.normalizedOperations[0]).toEqual(
        expect.objectContaining({
          kind: "update",
          path: "src/a.ts",
          hunks: expect.arrayContaining([
            expect.objectContaining({ changeContext: "-1,2 +1,2 @@" }),
            expect.objectContaining({ changeContext: "-8,2 +8,2 @@" }),
          ]),
        }),
      );
      expect(result.normalizedRawPatchText).toContain("@@ -1,2 +1,2 @@");
      expect(result.normalizedRawPatchText).toContain("@@ -8,2 +8,2 @@");
    }
  });

  it("decomposes safe rename-with-content-edit into move then target update", () => {
    const result = normalizeBoundedBroadPatchText(renameWithContentEditPatch());

    expect(result).toEqual(
      expect.objectContaining({
        status: "normalized",
        operationCount: 2,
        affectedPaths: ["src/a.ts", "src/b.ts"],
      }),
    );
    if (result.status === "normalized") {
      expect(result.normalizedOperations).toEqual([
        {
          kind: "move",
          path: "src/a.ts",
          moveTo: "src/b.ts",
          hunks: [],
        },
        expect.objectContaining({
          kind: "update",
          path: "src/b.ts",
        }),
      ]);
      expect(result.normalizedRawPatchText).toContain(
        "*** Update File: src/a.ts\n*** Move to: src/b.ts",
      );
      expect(result.normalizedRawPatchText).toContain(
        "*** Update File: src/b.ts",
      );
      expect(result.evidence).toContain(
        "bounded-broad-patch-normalizer:operation-count:2",
      );
    }
  });

  it("blocks binary, mode change, symlink, submodule, copy, no-newline markers, and malformed sections", () => {
    for (const [patchText, rejectionReason] of [
      [
        ["diff --git a/src/a.bin b/src/a.bin", "Binary files differ"].join("\n"),
        "unsupported-binary-patch",
      ],
      [
        [
          "diff --git a/src/a.ts b/src/a.ts",
          "old mode 100644",
          "new mode 100755",
        ].join("\n"),
        "unsupported-mode-change",
      ],
      [
        [
          "diff --git a/src/link b/src/link",
          "new file mode 120000",
          "--- /dev/null",
          "+++ b/src/link",
          "@@ -0,0 +1 @@",
          "+target",
        ].join("\n"),
        "unsupported-symlink-patch",
      ],
      [
        [
          "diff --git a/vendor/lib b/vendor/lib",
          "new file mode 160000",
          "--- /dev/null",
          "+++ b/vendor/lib",
          "@@ -0,0 +1 @@",
          "+160000",
        ].join("\n"),
        "unsupported-submodule-patch",
      ],
      [
        [
          "diff --git a/src/a.ts b/src/b.ts",
          "similarity index 100%",
          "copy from src/a.ts",
          "copy to src/b.ts",
        ].join("\n"),
        "unsupported-copy-patch",
      ],
      [
        [
          "diff --git a/src/a.ts b/src/a.ts",
          "--- a/src/a.ts",
          "+++ b/src/a.ts",
          "@@ -1 +1 @@",
          "-a = 1",
          "\\ No newline at end of file",
          "+a = 2",
        ].join("\n"),
        "unsupported-unified-diff",
      ],
      [
        ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts"].join("\n"),
        "malformed-broad-patch",
      ],
    ] as const) {
      expect(normalizeBoundedBroadPatchText(patchText)).toEqual(
        expect.objectContaining({
          status: expect.stringMatching(/unsupported|malformed/),
          rejectionReason,
        }),
      );
    }
  });

  it("blocks ambiguous fenced patch extraction before normalization", () => {
    const result = normalizeBoundedBroadPatchText(
      [
        "```diff",
        "diff --git a/src/a.ts b/src/a.ts",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -1 +1 @@",
        "-a = 1",
        "+a = 2",
        "```",
        "```diff",
        "diff --git a/src/b.ts b/src/b.ts",
        "--- a/src/b.ts",
        "+++ b/src/b.ts",
        "@@ -1 +1 @@",
        "-b = 1",
        "+b = 2",
        "```",
      ].join("\n"),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "unsupported",
        rejectionReason: "unsupported-broad-shape",
        evidence: expect.arrayContaining([
          "fenced-patch-extractor:multiple-fenced-blocks-blocked",
          "bounded-broad-patch-normalizer:no-write-authority",
        ]),
      }),
    );
  });

  it("keeps unsafe rename-with-content-edit shapes blocked", () => {
    for (const [patchText, rejectionReason] of [
      [
        [
          "diff --git a/src/a.ts b/src/b.ts",
          "similarity index 80%",
          "rename from src/a.ts",
          "rename to src/b.ts",
          "--- a/src/a.ts",
          "+++ b/src/b.ts",
          "@@ -1 +1 @@",
          "-a = 1",
          "+a = 2",
        ].join("\n"),
        "unsupported-broad-shape",
      ],
      [
        [
          "diff --git a/src/a.ts b/src/b.ts",
          "similarity index 100%",
          "rename from src/a.ts",
          "rename to src/b.ts",
          "old mode 100644",
          "new mode 100755",
          "--- a/src/a.ts",
          "+++ b/src/b.ts",
          "@@ -1 +1 @@",
          "-a = 1",
          "+a = 2",
        ].join("\n"),
        "unsupported-mode-change",
      ],
      [
        [
          "diff --git a/src/a.bin b/src/b.bin",
          "similarity index 100%",
          "rename from src/a.bin",
          "rename to src/b.bin",
          "Binary files a/src/a.bin and b/src/b.bin differ",
        ].join("\n"),
        "unsupported-binary-patch",
      ],
      [
        [
          "diff --git a/src/a.ts b/src/b.ts",
          "similarity index 100%",
          "rename from src/a.ts",
          "rename to src/b.ts",
          "--- a/src/a.ts",
          "+++ b/src/b.ts",
          "@@ -1 +1 @@",
          "-a = 1",
          "\\ No newline at end of file",
          "+a = 2",
        ].join("\n"),
        "unsupported-unified-diff",
      ],
    ] as const) {
      expect(normalizeBoundedBroadPatchText(patchText)).toEqual(
        expect.objectContaining({
          status: expect.stringMatching(/unsupported|malformed/),
          rejectionReason,
        }),
      );
    }
  });
});

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
