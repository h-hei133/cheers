import { describe, expect, it } from "vitest";

import { buildTaskContextAcquisition } from "./taskContextAcquisition.js";
import { buildTaskContextNeeds } from "./taskContextNeed.js";
import { buildTaskIntent } from "./taskIntent.js";
import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";

describe("task context acquisition", () => {
  it("plans bounded staged acquisitions from context needs", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "Plan a refactor for src/app.ts",
      targetPath: "src/app.ts",
      contextPlanningRequested: true,
      verifyAfterEdit: true,
    };
    const intent = buildTaskIntent({ userRequest: workflowPlan.reason, workflowPlan });
    const needSet = buildTaskContextNeeds({ intent });
    const acquisition = buildTaskContextAcquisition({ needSet });

    expect(acquisition.stages).toContain("context-packet");
    expect(acquisition.stages).toContain("context-graph");
    expect(acquisition.stages).toContain("code-graph-impact");
    expect(acquisition.policy).toBe("bounded-existing-facts-only");
    expect(acquisition.providerCall).toBe("not-run");
    expect(acquisition.commandDispatch).toBe("not-run");
    expect(acquisition.suggestedReads.length).toBeGreaterThan(0);
  });
});
