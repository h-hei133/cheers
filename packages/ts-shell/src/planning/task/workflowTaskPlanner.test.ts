import { describe, expect, it } from "vitest";
import { buildWorkflowDecisionTrace, type WorkflowTaskPlan } from "./workflowTaskPlanner.js";

describe("workflowTaskPlanner", () => {
  it("projects workflow task plan metadata into the existing decision trace shape", () => {
    const plan: WorkflowTaskPlan = {
      taskKind: "edit-file",
      reason: "continuation edit/write target resolved from restored session state",
      targetPath: "src/app.ts",
      inspectFirst: true,
      verifyAfterEdit: true,
      verifyCommand: "npm test -- --help",
      usedRestoredState: true,
      repairContextUsed: true,
      previousRemainingTargets: ["src/app.test.ts"],
      previousFailedEntries: [
        {
          path: "src/app.ts",
          failureCode: "patch-generation-failed",
          reason: "replace source text not found",
        },
      ],
      continuationLineage: ["diagnosticHandoff=failure"],
    };

    expect(buildWorkflowDecisionTrace(plan)).toEqual([
      "decision-trace: task=edit-file target=src/app.ts inspect=yes verify=yes restored=yes verifyCommand=npm test -- --help repairContext=used remainingTargets=1 failedEntries=1 diagnosticHandoff=failure",
    ]);
  });
});
