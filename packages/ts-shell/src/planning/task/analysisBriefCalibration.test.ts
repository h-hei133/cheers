import { describe, expect, it } from "vitest";

import { buildAnalysisBrief } from "./analysisBrief.js";
import { calibrateAnalysisBrief } from "./analysisBriefCalibration.js";
import { buildTaskContextAcquisition } from "./taskContextAcquisition.js";
import { buildTaskContextNeeds } from "./taskContextNeed.js";
import { evaluateTaskContextSufficiency } from "./taskContextSufficiency.js";
import { buildTaskIntent } from "./taskIntent.js";
import { buildTaskReadPlan } from "./taskReadPlan.js";
import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";

describe("analysis brief calibration", () => {
  it("downgrades under-evidenced analysis and preserves hidden reasoning boundary", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "read-file",
      reason: "Analyze src/app.ts",
      targetPath: "src/app.ts",
    };
    const intent = buildTaskIntent({ userRequest: workflowPlan.reason, workflowPlan });
    const readPlan = buildTaskReadPlan({ intent });
    const needSet = buildTaskContextNeeds({ intent });
    const acquisition = buildTaskContextAcquisition({ needSet });
    const sufficiency = evaluateTaskContextSufficiency({ needSet, acquisition });
    const brief = buildAnalysisBrief({
      intent,
      readPlan,
      observations: [{ claim: "The bug is probably in control flow.", evidenceIds: [] }],
    });
    const calibration = calibrateAnalysisBrief({ analysisBrief: brief, contextSufficiency: sufficiency });

    expect(calibration.readiness).toBe("missing-facts");
    expect(calibration.confidence).toBe("low");
    expect(calibration.riskLevel).toBe("high");
    expect(calibration.evidence).toContain("analysis-calibration:hidden-cot-excluded");
  });
});
