import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildWorkflowTaskPlan } from "./workflowTaskPlan.js";

describe("workflowTaskPlan", () => {
  it("keeps non-allowlisted command intent blocked at planning time", () => {
    const plan = buildWorkflowTaskPlan(
      "Please run dir in this workspace",
      path.resolve("/tmp/workflow-plan"),
    );

    expect(plan.taskKind).toBe("run-command");
    expect(plan.directCommand).toBe("dir");
    expect(plan.blockedReason).toContain(
      "Run-command intent is not allowed in the MVP allowlist: dir",
    );
  });

  it("keeps explicit read requests read-only", () => {
    const workspaceRoot = path.resolve("/tmp/workflow-plan");
    const plan = buildWorkflowTaskPlan(
      "Read package.json first 5 lines",
      workspaceRoot,
    );

    expect(plan.taskKind).toBe("read-file");
    expect(plan.targetPath).toBe("package.json");
    expect(plan.verifyAfterEdit).toBe(false);
  });
});
