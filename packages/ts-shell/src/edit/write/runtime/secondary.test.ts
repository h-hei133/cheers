import { describe, expect, it } from "vitest";

import type { QueryEvent } from "../../../core/query/runtime/events.js";
import type { WorkflowActionGraph } from "../../../planning/action/graph.js";
import type { ToolDispatcher } from "../../../tools/dispatch/dispatcher.js";
import type { MutationRuntimeAggregate } from "../../runtime/mutation.js";
import { runSecondaryWriteStage } from "./secondary.js";

describe("runSecondaryWriteStage", () => {
  it("executes related writes in action graph dependency order with changed-file accounting", async () => {
    const dispatchOrder: string[] = [];
    const aggregate = createAggregate();
    const graph: WorkflowActionGraph = {
      graphId: "workflow_action_graph_pair",
      orderedNodeIds: ["write-primary", "write-related-a", "write-related-b"],
      changedFileIntents: ["src/main.ts", "src/a.ts", "src/b.ts"],
      dependencyReasons: [
        "write-related-a<-write-primary: Apply related file update after the primary target mutation.",
        "write-related-b<-write-related-a: Apply dependent related file update.",
      ],
      nodes: [
        {
          id: "write-primary",
          kind: "write",
          target: "src/main.ts",
          dependsOn: [],
          reason: "Create primary file.",
        },
        {
          id: "write-related-a",
          kind: "write",
          target: "src/a.ts",
          dependsOn: ["write-primary"],
          reason: "Create first related file.",
        },
        {
          id: "write-related-b",
          kind: "write",
          target: "src/b.ts",
          dependsOn: ["write-related-a"],
          reason: "Create second related file.",
        },
      ],
    };

    await runSecondaryWriteStage({
      prompt: [
        "write src/b.ts with content: export const b = 1;.",
        "then write src/a.ts with content: export const a = 1;",
      ].join(" "),
      targetPath: "src/main.ts",
      workspaceRoot: "/workspace",
      sessionId: "sess",
      turn: 1,
      dispatcher: {
        dispatch: async (_toolName: string, args: { path?: string }) => {
          dispatchOrder.push(String(args.path));
          return { success: true, output: "" };
        },
      } as unknown as ToolDispatcher,
      events: [],
      aggregate,
      actionGraph: graph,
    });

    expect(dispatchOrder).toEqual(["src/a.ts", "src/b.ts"]);
    expect(aggregate.changedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(aggregate.evidence).toEqual(
      expect.arrayContaining([
        "secondary-write-action-graph:workflow_action_graph_pair",
        "secondary-write-intent:src/main.ts",
        "secondary-write-intent:src/a.ts",
        "secondary-write-intent:src/b.ts",
        "secondary-write-dependency:write-related-a<-write-primary: Apply related file update after the primary target mutation.",
        "secondary write applied on src/a.ts",
        "secondary write applied on src/b.ts",
      ]),
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
