import { describe, expect, it } from "vitest";

import { routeTaskLifecycleRuntime } from "./taskLifecycleRouter.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

describe("routeTaskLifecycleRuntime", () => {
  it("routes read analyze and plan surfaces without granting mutation authority", () => {
    const plan: WorkflowTaskPlan = {
      taskKind: "read-file",
      reason: "analyze target",
      targetPath: "src/app.ts",
      inspectFirst: true,
      verifyAfterEdit: false,
    };

    const route = routeTaskLifecycleRuntime({
      prompt: "Analyze src/app.ts and produce an execution plan.",
      workflowPlan: plan,
    });

    expect(route.shouldActivate).toBe(true);
    expect(route.kind).toBe("analysis-brief-surface");
    expect(route.surface).toBe("analyze");
    expect(route.evidence).toContain("task-lifecycle-router:mutation-authority:not-granted");
  });

  it("routes missing edit context to proposal readiness but preserves explicit edits", () => {
    const missingContext: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "edit intent needs targeted context planning before mutation",
      targetPath: "src/app.ts",
      blockedReason: "Missing concrete edit transform.",
      contextPlanningRequested: true,
      contextPlanningReason: "missing-edit-context",
      inspectFirst: false,
      verifyAfterEdit: false,
    };
    const explicitEdit: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "exact edit",
      targetPath: "src/app.ts",
      replaceFrom: "old",
      replaceTo: "new",
      inspectFirst: true,
      verifyAfterEdit: true,
      verifyCommand: "npm test -- --help",
    };

    expect(routeTaskLifecycleRuntime({ prompt: "Fix src/app.ts", workflowPlan: missingContext }).kind)
      .toBe("proposal-readiness");
    expect(routeTaskLifecycleRuntime({ prompt: "Replace old with new in src/app.ts", workflowPlan: explicitEdit }).shouldActivate)
      .toBe(false);
  });
});
