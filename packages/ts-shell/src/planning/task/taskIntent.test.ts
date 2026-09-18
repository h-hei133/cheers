import { describe, expect, it } from "vitest";

import { buildTaskIntent } from "./taskIntent.js";
import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";

describe("buildTaskIntent", () => {
  it("keeps edit planning separate from verification-output analysis when verifyAfterEdit is requested", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "Fix src/app.ts and run the adjacent test after review",
      targetPath: "src/app.ts",
      inspectFirst: true,
      verifyAfterEdit: true,
      verifyCommand: "npm test -- --help",
    };

    const intent = buildTaskIntent({
      userRequest: workflowPlan.reason,
      workflowPlan,
    });

    expect(intent.kind).toBe("edit-proposal");
    expect(intent.requiredStages).toEqual([
      "read",
      "analyze",
      "plan",
      "proposal",
      "review",
    ]);
    expect(intent.requestedOutcome).toBe("review-only edit proposal");
    expect(intent.mutationAuthority).toBe("not-granted");
  });

  it("uses verification intent for command-only verification tasks", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "run-command",
      reason: "Run the focused verification command",
      targetPath: "src/app.ts",
      inspectFirst: false,
      verifyAfterEdit: true,
      verifyCommand: "npm test -- --help",
    };

    const intent = buildTaskIntent({
      userRequest: workflowPlan.reason,
      workflowPlan,
    });

    expect(intent.kind).toBe("verification");
    expect(intent.requiredStages).toContain("verify");
  });
});
