import { describe, expect, it } from "vitest";
import { selectFencedEditReplacementActivation } from "./fencedEditActivation.js";

describe("fencedEditActivation", () => {
  it("selects exact fenced replacement with one explicit target and old/new mapping", () => {
    const activation = selectFencedEditReplacementActivation({
      prompt: [
        "Replace the exact fenced block in src/app.ts",
        "```",
        "status: draft",
        "```",
        "with",
        "```",
        "status: ready",
        "```",
      ].join("\n"),
      targetPath: "src/app.ts",
    });

    expect(activation.status).toBe("selected");
    if (activation.status === "selected") {
      expect(activation.targetPath).toBe("src/app.ts");
      expect(activation.mapping).toMatchObject({
        oldText: "status: draft",
        newText: "status: ready",
      });
      expect(activation.evidence).toEqual(
        expect.arrayContaining([
          "fenced-edit-activation:selected",
          "fenced-edit-activation:exact-mapping",
          "fenced-edit-activation:raw-content-excluded",
        ]),
      );
    }
  });

  it("stops unsupported fuzzy, discovery, broad, generated, and rollback requests", () => {
    const cases = [
      {
        prompt: "Replace the similar fenced block in src/app.ts with the closest new version.",
        blocker: "unsupported-fuzzy",
      },
      {
        prompt: "Find the right file and replace this fenced block.",
        blocker: "unsupported-discovery",
      },
      {
        prompt: "Update all fenced blocks in src/app.ts.",
        blocker: "unsupported-broad",
      },
      {
        prompt: "Generate a new implementation for the fenced block in src/app.ts.",
        blocker: "unsupported-generated",
      },
      {
        prompt: "Rollback the fenced block in src/app.ts.",
        blocker: "unsupported-rollback",
      },
    ];

    for (const entry of cases) {
      const activation = selectFencedEditReplacementActivation({
        prompt: entry.prompt,
        targetPath: "src/app.ts",
      });
      expect(activation.status).toBe("stopped");
      if (activation.status === "stopped") {
        expect(activation.route.blocker).toBe(entry.blocker);
        expect(activation.route.evidence).toContain(
          `fenced-edit-activation:blocker:${entry.blocker}`,
        );
        expect(activation.route.evidence).toContain(
          "fenced-edit-route:no-writer-invoked",
        );
      }
    }
  });

  it("stops missing target and missing mapping before activation", () => {
    const missingTarget = selectFencedEditReplacementActivation({
      prompt: [
        "Replace the exact fenced block",
        "```",
        "status: draft",
        "```",
        "with",
        "```",
        "status: ready",
        "```",
      ].join("\n"),
    });
    expect(missingTarget.status).toBe("stopped");
    if (missingTarget.status === "stopped") {
      expect(missingTarget.route.blocker).toBe("missing-target");
    }

    const missingMapping = selectFencedEditReplacementActivation({
      prompt: "Replace the fenced block in src/app.ts.",
      targetPath: "src/app.ts",
    });
    expect(missingMapping.status).toBe("stopped");
    if (missingMapping.status === "stopped") {
      expect(missingMapping.route.blocker).toBe("missing-mapping");
    }
  });
});
