import { describe, expect, it } from "vitest";
import { detectExactHunkConflicts } from "./conflict.js";

describe("exactHunkConflict", () => {
  it("accepts non-overlapping exact hunks and returns deterministic order", () => {
    const result = detectExactHunkConflicts({
      targetPath: "src/app.ts",
      hunks: [
        hunk("top", "a", "A", 0, 1),
        hunk("bottom", "c", "C", 2, 3),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.orderedHunks.map((entry) => entry.hunkId)).toEqual([
      "bottom",
      "top",
    ]);
  });

  it("stops overlapping or ambiguous hunks before mutation", () => {
    const overlapping = detectExactHunkConflicts({
      targetPath: "src/app.ts",
      hunks: [
        hunk("h1", "a\nb", "A", 0, 2),
        hunk("h2", "b\nc", "B", 1, 3),
      ],
    });
    const ambiguous = detectExactHunkConflicts({
      targetPath: "src/app.ts",
      hunks: [{ ...hunk("h1", "a", "A", 0, 1), matchCount: 2 }],
    });

    expect(overlapping.ok).toBe(false);
    expect(!overlapping.ok && overlapping.kind).toBe("overlapping-old-ranges");
    expect(ambiguous.ok).toBe(false);
    expect(!ambiguous.ok && ambiguous.kind).toBe("ambiguous-match-count");
  });

  it("stops order-dependent conflicts before mutation", () => {
    const result = detectExactHunkConflicts({
      targetPath: "src/app.ts",
      originalContent: "alpha\nmiddle\nomega\n",
      hunks: [
        hunk("top", "alpha", "done", 0, 1),
        hunk("bottom", "omega", "alpha", 2, 3),
      ],
    });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.kind).toBe("order-dependent-conflict");
    expect(!result.ok && result.evidence).toContain(
      "exact-hunk-conflict:blocker:order-dependent-conflict",
    );
  });
});

function hunk(
  hunkId: string,
  oldText: string,
  newText: string,
  startLine: number,
  endLine: number,
) {
  return {
    hunkId,
    targetPath: "src/app.ts",
    mapping: { oldText, newText, source: "old-new-fenced-blocks" as const },
    matchCount: 1,
    range: { startLine, endLine },
  };
}
