import { describe, expect, it } from "vitest";
import type {
  ParsedPatch,
  PatchApplicationPlan,
  PatchPreviewResult,
  PatchVerificationResult,
} from "./types.js";

describe("patch contract types", () => {
  it("can model a parsed single-file update without applying it", () => {
    const parsed: ParsedPatch = {
      rawText: [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-const value = 1;",
        "+const value = 2;",
        "*** End Patch",
      ].join("\n"),
      operations: [
        {
          kind: "update",
          path: "src/app.ts",
          hunks: [
            {
              lines: [
                { kind: "remove", text: "const value = 1;" },
                { kind: "add", text: "const value = 2;" },
              ],
            },
          ],
        },
      ],
    };

    expect(parsed.operations).toHaveLength(1);
    expect(parsed.operations[0]?.kind).toBe("update");
  });

  it("separates verified application plans from previews", () => {
    const parsed: ParsedPatch = {
      rawText: "patch",
      operations: [
        {
          kind: "update",
          path: "src/app.ts",
          hunks: [{ lines: [{ kind: "context", text: "const value = 1;" }] }],
        },
      ],
    };

    const plan: PatchApplicationPlan = {
      parsedPatch: parsed,
      atomicity: "verify-all-before-write",
      operations: [
        {
          operation: parsed.operations[0]!,
          originalContent: "const value = 1;\n",
          plannedContent: "const value = 2;\n",
          additions: 1,
          deletions: 1,
        },
      ],
    };

    const verification: PatchVerificationResult = {
      ok: true,
      plan,
      warnings: [],
    };

    const preview: PatchPreviewResult = {
      changedFiles: ["src/app.ts"],
      failedFiles: [],
      files: [
        {
          path: "src/app.ts",
          kind: "update",
          additions: 1,
          deletions: 1,
          summary: "M src/app.ts",
        },
      ],
      willWrite: false,
    };

    expect(verification.ok).toBe(true);
    expect(preview.willWrite).toBe(false);
    expect(preview.changedFiles).toEqual(["src/app.ts"]);
  });

  it("can model verification failure as a no-write result", () => {
    const failure: PatchVerificationResult = {
      ok: false,
      changedFiles: [],
      failures: [
        {
          code: "patch-verify-hunk-context-missing",
          path: "src/app.ts",
          message: "Expected hunk context was not found.",
          nextAction: "Re-read the target file and regenerate the patch.",
        },
      ],
    };

    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.changedFiles).toEqual([]);
      expect(failure.failures[0]?.code).toBe(
        "patch-verify-hunk-context-missing",
      );
    }
  });
});
