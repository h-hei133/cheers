import { describe, expect, it } from "vitest";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";
import { shouldRunPlanningRuntimeForBlockedVagueTask } from "./planningRuntimeProductRoute.js";

describe("planning runtime product route guard", () => {
  it("accepts blocked vague edit tasks before mutation", () => {
    expect(
      shouldRunPlanningRuntimeForBlockedVagueTask({
        taskKind: "edit-file",
        reason: "write/edit intent without resolvable target",
        inspectFirst: true,
        verifyAfterEdit: false,
        targetMissing: true,
        blockedReason: "edit-target-missing",
      }),
    ).toBe(true);
  });

  it("rejects explicit targets and command-only tasks without creating mutation targets", () => {
    expect(
      shouldRunPlanningRuntimeForBlockedVagueTask({
        taskKind: "edit-file",
        reason: "edit intent with explicit target",
        targetPath: "src/example.ts",
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason: "edit-transform-unclear",
        targetMissing: false,
      }),
    ).toBe(false);

    const commandPlan: WorkflowTaskPlan = {
      taskKind: "run-command",
      reason: "explicit run-command intent",
      inspectFirst: false,
      verifyAfterEdit: false,
      directCommand: "npm publish",
      blockedReason: "command not allowlisted",
    };
    expect(shouldRunPlanningRuntimeForBlockedVagueTask(commandPlan)).toBe(false);
    expect(commandPlan.targetPath).toBeUndefined();
  });
});
