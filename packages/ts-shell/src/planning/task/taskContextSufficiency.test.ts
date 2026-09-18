import { describe, expect, it } from "vitest";

import { buildTaskContextAcquisition } from "./taskContextAcquisition.js";
import { buildTaskContextNeeds } from "./taskContextNeed.js";
import { evaluateTaskContextSufficiency } from "./taskContextSufficiency.js";
import { buildTaskIntent } from "./taskIntent.js";
import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";

describe("task context sufficiency", () => {
  it("blocks provider and verification readiness when required evidence is missing", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "Repair failed verification for src/app.ts",
      targetPath: "src/app.ts",
      repairContextUsed: true,
      verifyAfterEdit: true,
    };
    const intent = buildTaskIntent({ userRequest: workflowPlan.reason, workflowPlan });
    const needSet = buildTaskContextNeeds({ intent });
    const acquisition = buildTaskContextAcquisition({ needSet });
    const sufficiency = evaluateTaskContextSufficiency({ needSet, acquisition });

    expect(sufficiency.state).toBe("needs-required-context");
    expect(sufficiency.providerProposalReadiness).toBe("blocked");
    expect(sufficiency.verificationPlanningReadiness).toBe("blocked");
    expect(sufficiency.editApplyReadiness).toBe("not-granted");
    expect(sufficiency.evidence).toContain("task-context-sufficiency:provider:blocked");
  });
});
