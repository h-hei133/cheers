import { describe, expect, it } from "vitest";

import { createArtifactReceipt } from "./model.js";

describe("artifact workflow model", () => {
  it("records report artifact intent, sources, validation, and non-success truth", () => {
    const receipt = createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["notes/source-a.md", "notes/source-b.md", "reports/summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
    });

    expect(receipt).toMatchObject({
      intent: "produce report artifact",
      kind: "report",
      outputPath: "reports/summary.md",
      validationState: "validation-passed",
      terminalSuccessClaim: false,
    });
    expect(receipt?.sourceReceipts).toHaveLength(2);
    expect(receipt?.blockers).toEqual([]);
  });

  it("blocks missing source, unsafe paths, invalid artifacts, and failed validation", () => {
    expect(createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["reports/summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
    })?.validationState).toBe("source-missing");

    expect(createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["../summary.md"],
      workspacePaths: ["notes/source.md", "../summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
    })?.validationState).toBe("unsafe-path");

    expect(createArtifactReceipt({
      taskKind: "data-artifact",
      outputKind: "artifact",
      requiredPaths: ["artifacts/totals.json"],
      workspacePaths: ["data/input.csv", "artifacts/totals.json"],
      verificationState: "selected-failed",
      failureCategories: ["artifact invalid"],
    })?.validationState).toBe("validation-failed");

    expect(createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["notes/source.md", "reports/summary.md"],
      verificationState: "selected-not-run",
      failureCategories: [],
    })?.validationState).toBe("not-proven");
  });
});
