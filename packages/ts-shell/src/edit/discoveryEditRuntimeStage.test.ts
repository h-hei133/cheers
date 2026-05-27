import { describe, expect, it } from "vitest";
import type { SandboxEnforcer } from "../sandbox/index.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import { runDiscoveryEditRuntimeStage } from "./discoveryEditRuntimeStage.js";

const denyingEnforcer = {
  checkAndEnforce: async () => ({ allowed: false }),
} as SandboxEnforcer;

describe("discoveryEditRuntimeStage", () => {
  it("returns undefined when discovery edit is not requested", async () => {
    const result = await runDiscoveryEditRuntimeStage({
      plan: { taskKind: "read-file", targetPath: "src/app.ts" } as WorkflowTaskPlan,
      prompt: "Read src/app.ts",
      workspaceRoot: "/tmp/workspace",
      sessionId: "sess_discovery_stage_inactive",
      enforcer: denyingEnforcer,
      events: [],
      baseNotes: ["base"],
    });

    expect(result).toBeUndefined();
  });

  it("keeps unsupported discovery fuzzy prompts stopped before mutation", async () => {
    const result = await runDiscoveryEditRuntimeStage({
      plan: { taskKind: "edit-file" } as WorkflowTaskPlan,
      prompt: [
        "Find the closest file and fuzzy replace the exact fenced block",
        "```",
        "status: draft",
        "```",
        "with",
        "```",
        "status: ready",
        "```",
      ].join("\n"),
      workspaceRoot: "/tmp/workspace",
      sessionId: "sess_discovery_stage_stopped",
      enforcer: denyingEnforcer,
      events: [],
      baseNotes: ["base"],
    });

    expect(result?.codingResult.changedFiles).toEqual([]);
    expect(result?.codingResult.evidence).toEqual(
      expect.arrayContaining([
        "discovery-edit-planner:unsupported-fuzzy",
        "discovery-edit-result:mutation:not-run",
        "discovery-edit-result:raw-content-excluded",
      ]),
    );
    expect(result?.notes).toContain(
      "discovery-edit: manifest produced without mutation",
    );
  });
});
