import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QueryEvent } from "../core/query/events.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import {
  runPrimaryMutationRuntimeStage,
  type MutationRuntimeAggregate,
} from "./mutationRuntimeStage.js";

describe("mutationRuntimeStage", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mutation-stage-"));
    fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("records explicit approval evidence and applied mutation facts", async () => {
    const calls: Array<{ toolName: string; args: Record<string, unknown> }> = [];
    const aggregate = createAggregate();
    const dispatcher = createDispatcher(async (toolName, args) => {
      calls.push({ toolName, args });
      return { success: true, output: "" };
    });

    await runPrimaryMutationRuntimeStage({
      plan: { taskKind: "write-file" },
      targetPath: "src/app.ts",
      workspaceRoot,
      sessionId: "sess",
      turn: 1,
      dispatcher,
      aggregate,
      content: "export const value = 1;\n",
      changedLines: 1,
      addedLines: 1,
      removedLines: 0,
      transformKind: "write",
    });

    expect(calls).toEqual([
      {
        toolName: "write",
        args: { path: "src/app.ts", content: "export const value = 1;\n" },
      },
    ]);
    expect(aggregate.changedFiles).toEqual(["src/app.ts"]);
    expect(aggregate.failedFiles).toEqual([]);
    expect(aggregate.patches).toEqual([
      {
        path: "src/app.ts",
        operation: "append",
        status: "applied",
        changedLines: 1,
        addedLines: 1,
        removedLines: 0,
      },
    ]);
    expect(aggregate.evidence).toContain(
      "edit/write applied on src/app.ts",
    );
    expect(
      aggregate.evidence.some((entry) =>
        entry.includes("current-request-scope-label:write/"),
      ),
    ).toBe(true);
  });

  it("blocks stale edit before dispatching a writer", async () => {
    fs.writeFileSync(path.join(workspaceRoot, "src/app.ts"), "new\n");
    const calls: string[] = [];
    const aggregate = createAggregate();
    const dispatcher = createDispatcher(async (toolName) => {
      calls.push(toolName);
      return { success: true, output: "" };
    });

    await runPrimaryMutationRuntimeStage({
      plan: { taskKind: "edit-file" },
      targetPath: "src/app.ts",
      workspaceRoot,
      sessionId: "sess",
      turn: 1,
      dispatcher,
      aggregate,
      content: "newer\n",
      changedLines: 1,
      addedLines: 0,
      removedLines: 0,
      originalContent: "old\n",
      transformKind: "replace",
    });

    expect(calls).toEqual([]);
    expect(aggregate.changedFiles).toEqual([]);
    expect(aggregate.failedFiles[0]?.reason).toContain("stale-read");
    expect(aggregate.patches[0]).toMatchObject({
      path: "src/app.ts",
      status: "failed",
      failureCode: "stale-read",
    });
    expect(aggregate.evidence).toContain("stale-read-blocker:src/app.ts");
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

function createDispatcher(
  dispatch: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<{ success: boolean; output?: string; error?: string }>,
): ToolDispatcher {
  return { dispatch } as unknown as ToolDispatcher;
}
