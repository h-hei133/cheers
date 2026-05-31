import { describe, expect, it } from "vitest";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import {
  runWorkflowMutationRuntime,
  type WorkflowMutationRuntimeAggregate,
} from "./workflowMutationRuntime.js";

describe("runWorkflowMutationRuntime", () => {
  it("projects cross-file converged continuation without dispatching writes", async () => {
    const calls: string[] = [];
    const aggregate = createAggregate();
    const result = await runWorkflowMutationRuntime({
      plan: {
        taskKind: "edit-file",
        targetPath: "src/app.ts",
        inspectFirst: false,
        verifyAfterEdit: false,
        crossFileRepair: true,
        crossFileConvergedNoop: true,
      },
      prompt: "continue",
      workspaceRoot: "/workspace",
      sessionId: "sess",
      turn: 1,
      dispatcher: {
        dispatch: async (toolName: string) => {
          calls.push(toolName);
          return { success: true, output: "" };
        },
      } as unknown as ToolDispatcher,
      aggregate,
    });

    expect(calls).toEqual([]);
    expect(result?.terminal?.codingResult.taskSatisfaction.verdict).toBe(
      "satisfied",
    );
    expect(result?.terminal?.codingResult.verification.status).toBe(
      "not-requested",
    );
    expect(result?.terminal?.userFacingOutput).toContain(
      "no remaining related files require edits",
    );
    expect(aggregate.evidence).toContain(
      "repair-cross-file converged:no-remaining-targets",
    );
  });
});

function createAggregate(): WorkflowMutationRuntimeAggregate {
  return {
    events: [] as QueryEvent[],
    notes: [],
    changedFiles: [],
    failedFiles: [],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    repairNotes: [],
    evidence: [],
    mutationResults: [],
    appliedContentByPath: new Map(),
  };
}
