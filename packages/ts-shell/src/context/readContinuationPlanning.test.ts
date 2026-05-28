import { describe, expect, it } from "vitest";

import { buildPathlessReadContinuationBlockedPlan } from "./readContinuationPlanning.js";

describe("readContinuationPlanning", () => {
  it("keeps unrecoverable pathless read follow-ups blocked and read-only", () => {
    const plan = buildPathlessReadContinuationBlockedPlan({
      blockedReason: "Read continuation target is unavailable.",
      rawContinuityTargetPath: "src/old.ts",
      continuationLineage: ["read-relocated"],
    });

    expect(plan).toMatchObject({
      taskKind: "read-file",
      reason: "pathless read follow-up could not recover continuation target",
      blockedReason: "Read continuation target is unavailable.",
      targetMissing: true,
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState: true,
      continuationLineage: ["read-relocated"],
    });
  });
});
