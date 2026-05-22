import { describe, expect, it } from "vitest";

import { buildRealTaskLoopPlan } from "./realTaskLoopPlan.js";

describe("realTaskLoopPlan", () => {
  it("records lifecycle, provider, confirmation, verification, and mutation authority state", () => {
    const plan = buildRealTaskLoopPlan({
      fixtureId: "fixture-1",
      lifecycleId: "lifecycle-1",
      analysisBriefId: "analysis-1",
      planQualityId: "quality-1",
      providerKind: "openai-compatible",
      dryRunId: "dry-run-1",
      anchoredProposalId: "anchored-1",
      confirmationState: "required",
    });

    expect(plan.state).toBe("confirmation-required");
    expect(plan.mutationAuthority).toBe("not-granted");
    expect(plan.evidence).toContain("real-task-loop-plan:confirmation:required");
  });
});
