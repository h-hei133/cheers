import { describe, expect, it } from "vitest";

import {
  buildReadFragmentPlanFields,
  buildReadOnlyPlan,
  buildReadWindowPlanFields,
} from "./readIntentPlanning.js";

describe("readIntentPlanning", () => {
  it("projects read windows without changing read-only truth", () => {
    const plan = buildReadOnlyPlan({
      reason: "explicit read intent takes precedence over inherited mutation context",
      targetPath: "src/app.ts",
      groundedDeliverableMode: "read",
      readWindow: { lineCount: 5, lineOffset: 10 },
      contextPrompt: "Read src/app.ts with a context packet",
      usedRestoredState: false,
    });

    expect(plan).toMatchObject({
      taskKind: "read-file",
      targetPath: "src/app.ts",
      readLineCount: 5,
      readLineOffset: 10,
      contextPlanningRequested: true,
      contextPlanningReason: "explicit-context-packet",
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState: false,
    });
    expect(plan).not.toHaveProperty("replaceFrom");
  });

  it("preserves read fragment projection fields", () => {
    expect(
      buildReadFragmentPlanFields({
        lineIndexes: [1, 3],
        ranges: ["1-3"],
        sourceWindowStart: 0,
        sourceWindowEnd: 10,
        fingerprint: "abc123",
        filter: "function-definitions",
      }),
    ).toEqual({
      readFragmentLineIndexes: [1, 3],
      readFragmentRanges: ["1-3"],
      readFragmentSourceWindowStart: 0,
      readFragmentSourceWindowEnd: 10,
      readFragmentFingerprint: "abc123",
      readFilter: "function-definitions",
    });
  });

  it("omits absent read window fields", () => {
    expect(buildReadWindowPlanFields({})).toEqual({});
  });
});
