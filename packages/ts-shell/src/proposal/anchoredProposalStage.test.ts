import { describe, expect, it } from "vitest";

import { runAnchoredProposalStage } from "./anchoredProposalStage.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";

describe("anchoredProposalStage", () => {
  it("does not activate for ordinary chat plans", async () => {
    const plan: WorkflowTaskPlan = {
      taskKind: "chat",
      reason: "chat intent",
      inspectFirst: false,
      verifyAfterEdit: false,
    };

    await expect(runAnchoredProposalStage({
      workspaceRoot: process.cwd(),
      prompt: "hello",
      workflowPlan: plan,
      providerMode: "synthetic",
      sessionId: "sess_anchored_stage_skip",
      turn: 1,
      events: [],
      baseNotes: [],
    })).resolves.toBeUndefined();
  });
});
