import { describe, expect, it } from "vitest";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import { runReadRuntimeStage } from "./readRuntimeStage.js";

function dispatcher(outputByPath: Record<string, string>): ToolDispatcher {
  return {
    dispatch: async (_toolName, args) => {
      const target = String(args.path ?? "");
      const output = outputByPath[target];
      return output === undefined
        ? { success: false, error: "missing" }
        : { success: true, output };
    },
  } as ToolDispatcher;
}

describe("readRuntimeStage", () => {
  it("returns a read-only terminal result with no changed files", async () => {
    const result = await runReadRuntimeStage({
      plan: {
        taskKind: "read-file",
        inspectFirst: true,
        targetPath: "src/app.ts",
      } as WorkflowTaskPlan,
      prompt: "Read src/app.ts",
      dispatcher: dispatcher({ "src/app.ts": "export const value = 1;\n" }),
      events: [],
      notes: [],
      changedFiles: [],
      failedFiles: [],
      patches: [],
      verifiedFiles: [],
      unverifiedFiles: [],
      repairNotes: [],
      evidence: [],
      unchangedAssertions: [],
      sessionId: "sess_read_stage",
      turn: 1,
      workspaceRoot: "/tmp/workspace",
    });

    expect(result?.kind).toBe("terminal");
    if (result?.kind !== "terminal") {
      return;
    }
    expect(result.result.codingResult.taskKind).toBe("read-file");
    expect(result.result.codingResult.changedFiles).toEqual([]);
    expect(result.result.codingResult.verification.status).toBe(
      "not-requested",
    );
    expect(result.result.userFacingOutput).toContain("export const value");
  });
});
