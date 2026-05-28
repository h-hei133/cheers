import { describe, expect, it } from "vitest";

import {
  buildGroundedReadMissingTargetPlan,
  buildGroundedReadOutOfWorkspacePlan,
} from "./readTargetPlanning.js";

describe("readTargetPlanning", () => {
  it("keeps missing grounded read targets blocked", () => {
    const plan = buildGroundedReadMissingTargetPlan({
      reason: "grounded read/summarize/explain requires a resolvable target path",
      stopReason: "Provide a valid in-workspace file path.",
      doNext: "Provide a valid in-workspace file path.",
      usedRestoredState: false,
    });

    expect(plan.taskKind).toBe("read-file");
    expect(plan.targetMissing).toBe(true);
    expect(plan.verifyAfterEdit).toBe(false);
    expect(plan.blockedReason).toContain(
      "Provide a valid in-workspace file path.",
    );
  });

  it("keeps out-of-workspace grounded read targets blocked", () => {
    const plan = buildGroundedReadOutOfWorkspacePlan({
      targetPath: "../outside.ts",
      usedRestoredState: true,
    });

    expect(plan).toMatchObject({
      taskKind: "read-file",
      targetPath: "../outside.ts",
      targetMissing: true,
      verifyAfterEdit: false,
      usedRestoredState: true,
    });
    expect(plan.blockedReason).toContain("outside current workspace");
  });
});
