import { describe, expect, it } from "vitest";

import { runPlanningRuntimeStage } from "./planningRuntimeStage.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";

describe("planningRuntimeStage", () => {
  it("does not intercept chat plans", async () => {
    const plan: WorkflowTaskPlan = {
      taskKind: "chat",
      reason: "chat intent",
      inspectFirst: false,
      verifyAfterEdit: false,
    };

    await expect(runPlanningRuntimeStage({
      plan,
      prompt: "hello",
      workspaceRoot: process.cwd(),
      sessionId: "sess_planning_stage_skip",
      turn: 1,
      dispatcher: undefined as never,
      events: [],
      baseNotes: [],
    })).resolves.toBeUndefined();
  });
});
