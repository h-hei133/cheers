import { describe, expect, it } from "vitest";
import {
  buildExactHunkSetModel,
  locateExactHunkRange,
  sortHunksForApply,
} from "./exactHunkSet.js";

describe("exactHunkSet", () => {
  it("models exact hunks with hashes and no raw old/new content", () => {
    const model = buildExactHunkSetModel({
      proposalId: "provider-edit-test",
      hunkSetId: "proposal-hunk-set-test",
      hunks: [
        {
          hunkId: "h1",
          targetPath: "src/app.ts",
          mapping: mapping("alpha", "beta"),
          matchCount: 1,
          range: { startLine: 0, endLine: 1 },
        },
      ],
    });

    expect(model.files[0]?.hunks[0]?.oldTextHash).toHaveLength(16);
    expect(model.files[0]?.hunks[0]?.oldTextSummary).toBe("lines:1;bytes:5");
    expect(JSON.stringify(model)).not.toContain("alpha");
    expect(JSON.stringify(model)).not.toContain("beta");
    expect(model.evidence).toContain("exact-hunk-set:raw-content-excluded");
  });

  it("locates unique ranges and orders hunks by descending original range", () => {
    expect(locateExactHunkRange({ content: "a\nb\nc\n", oldText: "b" })).toEqual({
      matchCount: 1,
      range: { startLine: 1, endLine: 2 },
    });
    expect(
      sortHunksForApply([
        { hunkId: "top", range: { startLine: 0, endLine: 1 } },
        { hunkId: "bottom", range: { startLine: 2, endLine: 3 } },
      ]).map((hunk) => hunk.hunkId),
    ).toEqual(["bottom", "top"]);
  });
});

function mapping(oldText: string, newText: string) {
  return { oldText, newText, source: "old-new-fenced-blocks" as const };
}
