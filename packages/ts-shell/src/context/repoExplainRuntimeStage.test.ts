import { describe, expect, it } from "vitest";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";
import { runRepoExplainRuntimeStage } from "./repoExplainRuntimeStage.js";

function dispatcher(outputByPath: Record<string, string>): ToolDispatcher {
  return {
    dispatch: async (toolName, args) => {
      if (toolName === "glob") {
        return { success: true, output: "src/app.ts\n" };
      }
      const target = String(args.path ?? "");
      const output = outputByPath[target];
      return output === undefined
        ? { success: false, error: "missing" }
        : { success: true, output };
    },
  } as ToolDispatcher;
}

describe("repoExplainRuntimeStage", () => {
  it("preserves needs-verification caveat for symptom diagnosis", async () => {
    const result = await runRepoExplainRuntimeStage({
      plan: { taskKind: "repo-explain", targetPath: "src/app.ts" } as WorkflowTaskPlan,
      prompt: "Why is src/app.ts failing?",
      dispatcher: dispatcher({ "src/app.ts": "throw new Error('boom');\n" }),
      events: [],
      notes: [],
      changedFiles: [],
      failedFiles: [],
      patches: [],
      verifiedFiles: [],
      unverifiedFiles: [],
      repairNotes: [],
      evidence: [],
      sessionId: "sess_repo_explain_stage",
      turn: 1,
      workspaceRoot: "/tmp/workspace",
    });

    expect(result?.codingResult.taskKind).toBe("repo-explain");
    expect(result?.codingResult.changedFiles).toEqual([]);
    expect(result?.codingResult.verification.status).toBe("not-requested");
    expect(result?.codingResult.diagnosis?.disposition).toBe(
      "needs-verification",
    );
    expect(result?.codingResult.evidence).toContain(
      "repo-explain: read src/app.ts",
    );
  });
});
