import { describe, expect, it } from "vitest";

import { buildTaskContextNeeds } from "./taskContextNeed.js";
import { buildTaskIntent } from "./taskIntent.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

describe("task context needs", () => {
  it("derives bug investigation source, tests, and call-site context without mutation authority", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "read-file",
      reason: "Investigate why src/app.ts fails",
      targetPath: "src/app.ts",
      inspectFirst: true,
    };
    const intent = buildTaskIntent({
      userRequest: "Investigate why src/app.ts fails",
      workflowPlan,
    });
    const needs = buildTaskContextNeeds({ intent });

    expect(needs.needs.map((need) => need.kind)).toEqual([
      "root-target",
      "direct-imports",
      "reverse-call-sites",
      "sibling-tests",
      "docs-readme",
    ]);
    expect(needs.missingRequiredNeedIds).toHaveLength(1);
    expect(needs.mutationAuthority).toBe("not-granted");
    expect(needs.evidence).toContain("task-context-needs:provider-call:not-run");
  });

  it("requires verification output and runtime receipt for repair planning", () => {
    const workflowPlan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "Repair failed verification for src/app.ts",
      targetPath: "src/app.ts",
      repairContextUsed: true,
      verifyAfterEdit: true,
    };
    const intent = buildTaskIntent({ userRequest: workflowPlan.reason, workflowPlan });
    const needs = buildTaskContextNeeds({ intent });

    expect(needs.needs.filter((need) => need.required).map((need) => need.kind)).toContain("runtime-receipt");
    expect(needs.needs.filter((need) => need.required).map((need) => need.kind)).toContain("repair-evidence");
    expect(needs.missingRequiredNeedIds.length).toBeGreaterThan(1);
  });
});
