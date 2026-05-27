import { describe, expect, it } from "vitest";
import type { SandboxEnforcer } from "../sandbox/index.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import { runFencedEditRuntimeStage } from "./fencedEditRuntimeStage.js";

function plan(overrides: Partial<WorkflowTaskPlan>): WorkflowTaskPlan {
  return {
    taskKind: "edit-file",
    ...overrides,
  } as WorkflowTaskPlan;
}

const denyingEnforcer = {
  checkAndEnforce: async () => ({ allowed: false }),
} as SandboxEnforcer;

describe("fencedEditRuntimeStage", () => {
  it("returns undefined when the prompt does not activate fenced replacement", async () => {
    const result = await runFencedEditRuntimeStage({
      plan: plan({ taskKind: "read-file", targetPath: "src/app.ts" }),
      prompt: "Read src/app.ts",
      workspaceRoot: "/tmp/workspace",
      sessionId: "sess_fenced_stage_inactive",
      enforcer: denyingEnforcer,
      events: [],
      baseNotes: ["base"],
    });

    expect(result).toBeUndefined();
  });

  it("projects unsupported fuzzy fenced replacement as stopped without approval", async () => {
    const result = await runFencedEditRuntimeStage({
      plan: plan({ taskKind: "edit-file", targetPath: "src/app.ts" }),
      prompt:
        "Replace the similar fenced block in src/app.ts with the closest new version.",
      workspaceRoot: "/tmp/workspace",
      sessionId: "sess_fenced_stage_stopped",
      enforcer: denyingEnforcer,
      events: [],
      baseNotes: ["base"],
    });

    expect(result?.codingResult.changedFiles).toEqual([]);
    expect(result?.codingResult.evidence).toEqual(
      expect.arrayContaining([
        "fenced-edit-activation:blocker:unsupported-fuzzy",
        "fenced-edit-mutation:not-run",
      ]),
    );
    expect(result?.notes).toContain(
      "fenced-edit-activation: stopped before mutation",
    );
  });
});
