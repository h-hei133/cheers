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

  it("normalizes exactly 8 operations and leaves the count boundary to candidate routing", () => {
    const result = normalizeBoundedBroadPatchText(
      Array.from({ length: 8 }, (_, index) => {
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
        operationCount: 8,
      }),
    );
  });

  it("blocks binary, mode change, rename-with-content, no-newline markers, and malformed sections", () => {
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
          "diff --git a/src/a.ts b/src/b.ts",
          "similarity index 80%",
          "rename from src/a.ts",
          "rename to src/b.ts",
        ].join("\n"),
        "unsupported-broad-shape",
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
});
