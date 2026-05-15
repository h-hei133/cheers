import { describe, expect, it } from "vitest";
import { extractFencedPatchText } from "./fencedPatchExtractor.js";

describe("extractFencedPatchText", () => {
  it("extracts one fenced git-style diff with optional prose", () => {
    expect(
      extractFencedPatchText(
        [
          "Use this patch:",
          "```diff",
          gitUpdatePatch(),
          "```",
          "No other files.",
        ].join("\n"),
      ),
    ).toEqual(
      expect.objectContaining({
        status: "extracted",
        sourceKind: "fenced-git-diff",
        extractedPatch: gitUpdatePatch(),
        evidence: expect.arrayContaining([
          "fenced-patch-extractor:single-fenced-patch-extracted",
          "fenced-patch-extractor:no-write-authority",
        ]),
      }),
    );
  });

  it("accepts patch, text, and unlabeled fences only for clear patch content", () => {
    for (const opening of ["```patch", "```text", "```"]) {
      expect(
        extractFencedPatchText([opening, gitUpdatePatch(), "```"].join("\n")),
      ).toEqual(
        expect.objectContaining({
          status: "extracted",
          sourceKind: "fenced-git-diff",
          extractedPatch: gitUpdatePatch(),
        }),
      );
    }
  });

  it("leaves raw marker and raw git-style patches to existing parsers", () => {
    expect(extractFencedPatchText(markerPatch())).toEqual(
      expect.objectContaining({
        status: "not-needed",
        sourceKind: "raw-patch",
      }),
    );
    expect(extractFencedPatchText(gitUpdatePatch())).toEqual(
      expect.objectContaining({
        status: "not-needed",
        sourceKind: "raw-patch",
      }),
    );
  });

  it("blocks multiple, non-patch, incomplete, nested, and extra-candidate fences", () => {
    for (const [rawPatchText, rejectionReason, status] of [
      [
        ["```diff", gitUpdatePatch(), "```", "```diff", gitUpdatePatch(), "```"].join("\n"),
        "multiple-fenced-blocks",
        "unsupported",
      ],
      [["```ts", "const x = 1;", "```"].join("\n"), "non-patch-fence", "unsupported"],
      [["```diff", gitUpdatePatch()].join("\n"), "incomplete-fence", "malformed"],
      [
        ["```diff", gitUpdatePatch(), "```nested", "```"].join("\n"),
        "ambiguous-nested-fence",
        "malformed",
      ],
      [
        [gitUpdatePatch(), "```diff", gitUpdatePatch(), "```"].join("\n"),
        "multiple-patch-candidates",
        "unsupported",
      ],
      [
        ["```text", "Here is a diff:", gitUpdatePatch(), "```"].join("\n"),
        "non-patch-fence",
        "unsupported",
      ],
    ] as const) {
      expect(extractFencedPatchText(rawPatchText)).toEqual(
        expect.objectContaining({
          status,
          rejectionReason,
          evidence: expect.arrayContaining([
            "fenced-patch-extractor:no-write-authority",
          ]),
        }),
      );
    }
  });
});

function markerPatch(): string {
  return [
    "*** Begin Patch",
    "*** Update File: src/a.ts",
    "@@",
    "-a = 1",
    "+a = 2",
    "*** End Patch",
  ].join("\n");
}

function gitUpdatePatch(): string {
  return [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1 +1 @@",
    "-a = 1",
    "+a = 2",
  ].join("\n");
}
