import { describe, expect, it } from "vitest";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import { runInspectFilesStage } from "./inspectFilesStage.js";

const dispatcher = {
  dispatch: async () => ({ success: true, output: "src/app.ts\nsrc/main.ts\n" }),
} as ToolDispatcher;

describe("inspectFilesStage", () => {
  it("keeps repository inspection read-only", async () => {
    const result = await runInspectFilesStage({
      plan: { taskKind: "inspect-files" } as WorkflowTaskPlan,
      dispatcher,
      events: [],
      notes: [],
      changedFiles: [],
      failedFiles: [],
      patches: [],
      verifiedFiles: [],
      unverifiedFiles: [],
      repairNotes: [],
      evidence: [],
      sessionId: "sess_inspect_stage",
      turn: 1,
      workspaceRoot: "/tmp/workspace",
    });

    expect(result?.codingResult.taskKind).toBe("inspect-files");
    expect(result?.codingResult.changedFiles).toEqual([]);
    expect(result?.codingResult.verification.status).toBe("not-requested");
    expect(result?.codingResult.evidence).toContain("inspect: glob(.ts) executed");
  });
});
