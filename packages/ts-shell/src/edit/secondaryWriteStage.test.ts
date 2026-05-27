import { describe, expect, it } from "vitest";
import type { QueryEvent } from "../core/query/events.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import { runSecondaryWriteStage } from "./secondaryWriteStage.js";
import type { MutationRuntimeAggregate } from "./mutationRuntimeStage.js";

describe("secondaryWriteStage", () => {
  it("applies inline secondary writes only through explicit write dispatch", async () => {
    const calls: Array<{ toolName: string; args: Record<string, unknown> }> = [];
    const aggregate = createAggregate();
    const dispatcher = {
      dispatch: async (toolName: string, args: Record<string, unknown>) => {
        calls.push({ toolName, args });
        return { success: true, output: "" };
      },
    } as unknown as ToolDispatcher;

    await runSecondaryWriteStage({
      prompt: "Update src/app.ts and write src/notes.md with content: hello",
      targetPath: "src/app.ts",
      workspaceRoot: "/workspace",
      sessionId: "sess",
      turn: 3,
      dispatcher,
      events: aggregate.events,
      aggregate,
    });

    expect(calls).toEqual([
      {
        toolName: "write",
        args: { path: "src/notes.md", content: "hello" },
      },
    ]);
    expect(aggregate.changedFiles).toEqual(["src/notes.md"]);
    expect(aggregate.evidence).toContain(
      "secondary write applied on src/notes.md",
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
