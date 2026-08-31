import { describe, it, expect } from "vitest";
import { generateSimpleDiff, renderDiff } from "./diff.js";

describe("Unified Diff Renderer", () => {
  it("renders multi-line unified diffs with semantic color styles", () => {
    const rawDiff = [
      "--- a/file.ts",
      "+++ b/file.ts",
      "@@ -1,3 +1,3 @@",
      "- const oldVal = 1;",
      "+ const newVal = 2;",
      "  const common = 3;",
    ].join("\n");

    const rendered = renderDiff(rawDiff);
    expect(rendered).toContain("const oldVal = 1;");
    expect(rendered).toContain("const newVal = 2;");
  });

  it("generates simple visual diff from original and modified strings", () => {
    const original = "line1\nline2";
    const modified = "line1\nline2-modified";

    const diffOutput = generateSimpleDiff(original, modified);
    expect(diffOutput).toContain("- line2");
    expect(diffOutput).toContain("+ line2-modified");
  });
});
