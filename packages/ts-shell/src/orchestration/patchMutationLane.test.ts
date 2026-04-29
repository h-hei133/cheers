import { describe, expect, it } from "vitest";
import {
  applySingleFileReplacePatch,
  formatPatchFailureReason,
} from "./patchMutationLane.js";

describe("patchMutationLane", () => {
  it("applies a single exact replacement", () => {
    const result = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "export const value = 1;\n",
      replaceDirective: {
        from: "value = 1",
        to: "value = 2",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toBe("export const value = 2;\n");
      expect(result.matchedCount).toBe(1);
    }
  });

  it("reports missing target before mutation", () => {
    const result = applySingleFileReplacePatch({
      targetPath: "src/missing.ts",
      originalContent: undefined,
      replaceDirective: {
        from: "old",
        to: "new",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("patch-target-missing");
      expect(formatPatchFailureReason(result)).toContain(
        "Read the target file",
      );
    }
  });

  it("reports source text not found", () => {
    const result = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "const value = 1;\n",
      replaceDirective: {
        from: "value = 2",
        to: "value = 3",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("patch-from-not-found");
      expect(result.matchedCount).toBe(0);
    }
  });

  it("reports ambiguous repeated source text", () => {
    const result = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "const value = 1;\nconst value = 1;\n",
      replaceDirective: {
        from: "const value = 1;",
        to: "const value = 2;",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("patch-ambiguous");
      expect(result.matchedCount).toBe(2);
      expect(result.nextAction).toContain("more specific");
    }
  });

  it("rejects apply_patch-shaped input instead of treating it as ordinary text", () => {
    const result = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "const value = 1;\n",
      replaceDirective: {
        from: [
          "*** Begin Patch",
          "*** Update File: src/app.ts",
          "@@",
          "-const value = 1;",
          "+const value = 2;",
          "*** End Patch",
        ].join("\n"),
        to: "",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("patch-generation-failed");
      expect(result.reason).toContain("only supports one explicit single-file");
      expect(result.nextAction).toContain("exact replace-from");
    }
  });

  it("rejects unified diff input instead of applying a partial patch", () => {
    const result = applySingleFileReplacePatch({
      targetPath: "src/app.ts",
      originalContent: "const value = 1;\n",
      replaceDirective: {
        from: [
          "diff --git a/src/app.ts b/src/app.ts",
          "--- a/src/app.ts",
          "+++ b/src/app.ts",
          "@@ -1 +1 @@",
          "-const value = 1;",
          "+const value = 2;",
        ].join("\n"),
        to: "",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failureCode).toBe("patch-generation-failed");
      expect(result.explanation).toContain("unified diff");
    }
  });
});
