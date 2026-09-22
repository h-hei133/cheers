import { describe, expect, it } from "vitest";
import {
  parseExactFencedReplacementMapping,
  planExactFencedReplacement,
} from "./fencedEditPlanner.js";

describe("fencedEditPlanner", () => {
  it("parses exact old/new fenced mappings without raw evidence", () => {
    const result = parseExactFencedReplacementMapping({
      prompt: [
        "Replace this exact block in src/app.ts",
        "```ts",
        "status: draft",
        "```",
        "with",
        "```ts",
        "status: ready",
        "```",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mapping).toMatchObject({
        oldText: "status: draft",
        newText: "status: ready",
        source: "old-new-fenced-blocks",
      });
      expect(result.evidence.join("\n")).not.toContain("status: ready");
    }
  });

  it("plans a single exact fenced replacement as an apply_patch update", () => {
    const result = planExactFencedReplacement({
      targetPath: "src/app.ts",
      originalContent: "header\nstatus: draft\nfooter\n",
      mapping: {
        oldText: "status: draft",
        newText: "status: ready",
        source: "old-new-fenced-blocks",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matchCount).toBe(1);
      expect(result.rawPatchText).toContain("*** Update File: src/app.ts");
      expect(result.rawPatchText).toContain("-status: draft");
      expect(result.rawPatchText).toContain("+status: ready");
      expect(result.evidence).toEqual(
        expect.arrayContaining([
          "fenced-edit-plan:exact-mapping-ready",
          "fenced-edit-plan:match-count:1",
          "fenced-edit-plan:raw-content-excluded",
        ]),
      );
    }
  });

  it("stops missing target and missing mapping before mutation", () => {
    const missingTarget = planExactFencedReplacement({
      originalContent: "status: draft\n",
      mapping: {
        oldText: "status: draft",
        newText: "status: ready",
        source: "old-new-fenced-blocks",
      },
    });
    expect(missingTarget.ok).toBe(false);
    if (!missingTarget.ok) {
      expect(missingTarget.blocker).toBe("missing-target");
      expect(missingTarget.evidence).toContain("fenced-edit-plan:mutation-not-run");
    }

    const missingMapping = parseExactFencedReplacementMapping({
      prompt: ["Replace with", "```", "status: ready", "```"].join("\n"),
    });
    expect(missingMapping.ok).toBe(false);
    if (!missingMapping.ok) {
      expect(missingMapping.blocker).toBe("missing-mapping");
      expect(missingMapping.nextAction).toContain("old fenced block");
    }
  });

  it("stops not-found, multiple-match, and fuzzy replacement requests", () => {
    const notFound = planExactFencedReplacement({
      targetPath: "src/app.ts",
      originalContent: "status: draft\n",
      mapping: {
        oldText: "status: missing",
        newText: "status: ready",
        source: "old-new-fenced-blocks",
      },
    });
    expect(notFound.ok).toBe(false);
    if (!notFound.ok) {
      expect(notFound.blocker).toBe("mapping-not-found");
    }

    const multiple = planExactFencedReplacement({
      targetPath: "src/app.ts",
      originalContent: "status: draft\nstatus: draft\n",
      mapping: {
        oldText: "status: draft",
        newText: "status: ready",
        source: "old-new-fenced-blocks",
      },
    });
    expect(multiple.ok).toBe(false);
    if (!multiple.ok) {
      expect(multiple.blocker).toBe("multiple-matches");
      expect(multiple.matchCount).toBe(2);
    }

    const fuzzy = parseExactFencedReplacementMapping({
      prompt: "Replace the similar fenced block with the closest new version.",
    });
    expect(fuzzy.ok).toBe(false);
    if (!fuzzy.ok) {
      expect(fuzzy.blocker).toBe("unsupported-fuzzy");
    }
  });
});
