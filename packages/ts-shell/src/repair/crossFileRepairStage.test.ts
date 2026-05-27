import { describe, expect, it } from "vitest";
import type { QueryEvent } from "../core/query/events.js";
import type { MutationRuntimeAggregate } from "../edit/mutationRuntimeStage.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import { runCrossFileRepairStage } from "./crossFileRepairStage.js";

describe("crossFileRepairStage", () => {
  it("preserves applied, failed, remaining, and partial repair evidence", async () => {
    const aggregate = createAggregate();
    const dispatcher = {
      dispatch: async (toolName: string, args: Record<string, unknown>) => {
        if (toolName === "read" && args.path === "src/a.ts") {
          return { success: true, output: "mode=old\n" };
        }
        if (toolName === "read" && args.path === "src/b.ts") {
          return { success: true, output: "mode=other\n" };
        }
        return { success: true, output: "" };
      },
    } as unknown as ToolDispatcher;

    const result = await runCrossFileRepairStage({
      plan: {
        taskKind: "edit-file",
        crossFileRepair: true,
        additionalTargetPaths: ["src/a.ts", "src/b.ts"],
      },
      prompt: "replace mode=old with mode=new",
      targetPath: "src/main.ts",
      replaceDirective: { from: "mode=old", to: "mode=new" },
      workspaceRoot: "/workspace",
      sessionId: "sess",
      turn: 4,
      dispatcher,
      aggregate,
    });

    expect(result.remainingTargets).toEqual(["src/b.ts"]);
    expect(result.failedByReason).toEqual([
      {
        path: "src/b.ts",
        failureCode: "patch-generation-failed",
        reason: "Replace source text not found in target file.",
      },
    ]);
    expect(aggregate.changedFiles).toEqual(["src/a.ts"]);
    expect(aggregate.failedFiles).toEqual([
      {
        path: "src/b.ts",
        reason: "Replace source text not found in target file.",
      },
    ]);
    expect(aggregate.evidence).toContain("repair-cross-file applied on src/a.ts");
    expect(aggregate.evidence).toContain("repair-remaining-files:src/b.ts");
    expect(aggregate.evidence).toContain(
      "repair-outcome:partial-complete-with-remaining",
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
