import { describe, expect, it } from "vitest";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import { runLowRiskRenameStage } from "./lowRiskRenameStage.js";
import type { MutationRuntimeAggregate } from "./mutationRuntimeStage.js";

describe("lowRiskRenameStage", () => {
  it("reads secondary rename targets and records explicit edit facts", async () => {
    const calls: Array<{ toolName: string; args: Record<string, unknown> }> = [];
    const aggregate = createAggregate();
    const dispatcher = {
      dispatch: async (toolName: string, args: Record<string, unknown>) => {
        calls.push({ toolName, args });
        if (toolName === "read") {
          return { success: true, output: "const oldName = oldName + 1;\n" };
        }
        return { success: true, output: "" };
      },
    } as unknown as ToolDispatcher;

    await runLowRiskRenameStage({
      rename: {
        from: "oldName",
        to: "newName",
        paths: ["src/app.ts", "src/other.ts"],
      },
      targetPath: "src/app.ts",
      workspaceRoot: "/workspace",
      sessionId: "sess",
      turn: 2,
      dispatcher,
      events: aggregate.events,
      aggregate,
    });

    expect(calls.map((call) => call.toolName)).toEqual(["read", "edit"]);
    expect(calls[1]?.args).toEqual({
      path: "src/other.ts",
      content: "const newName = newName + 1;\n",
    });
    expect(aggregate.changedFiles).toEqual(["src/other.ts"]);
    expect(aggregate.evidence).toContain(
      "rename-refactor:src/other.ts:oldName->newName",
    );
  });
});

function createAggregate(): MutationRuntimeAggregate {
  return {
    events: [] as QueryEvent[],
    notes: [],
    changedFiles: [],
    failedFiles: [],
    patches: [],
    evidence: [],
    mutationResults: [],
    appliedContentByPath: new Map(),
  };
}
