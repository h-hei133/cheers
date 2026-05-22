import { describe, expect, it } from "vitest";

import { evaluateAnalysisQualityGate } from "./analysisQualityGate.js";
import { buildTaskContextAcquisition } from "./taskContextAcquisition.js";
import { buildTaskContextNeeds } from "./taskContextNeed.js";
import { buildTaskContextResult } from "./taskContextResult.js";
import { evaluateTaskContextSufficiency } from "./taskContextSufficiency.js";
import { buildTaskIntent } from "./taskIntent.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

describe("task context result", () => {
  it("surfaces missing facts and suggested reads without raw content or write authority", () => {
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
    const gate = evaluateAnalysisQualityGate({ action: "provider-proposal" });
    const result = buildTaskContextResult({
      needSet,
      acquisition,
      sufficiency,
      analysisQualityGate: gate,
    });

    expect(result.outcome).toBe("provider-blocked-by-analysis-quality");
    expect(result.output).toContain("No-write status: mutation authority not granted");
    expect(result.evidence).toContain("task-context-result:hidden-cot-excluded");
    expect(result.suggestedReads.length).toBeGreaterThan(0);
  });
});
