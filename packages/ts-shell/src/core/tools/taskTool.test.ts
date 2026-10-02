import { expect, it } from "vitest";
import { createTaskToolDefinition } from "./taskTool.js";
import type { SubagentRunResult } from "../subagents/runner.js";

const completed: SubagentRunResult = { text: "answer", failed: false, steps: 1, allowedTools: [] };

it.each([
  { ...completed, failed: true, failure: "step budget exhausted", text: "I started inspecting" },
  { ...completed, failed: true, failure: "the run was aborted", text: "partial notes" },
  { ...completed, failed: true, failure: "model rejected request", text: "" },
  { ...completed, failed: true, failure: "  ", text: "partial notes" },
  { ...completed, failed: true, text: "partial notes" },
])("preserves a failed child's reason and any partial response: $failure", async (child) => {
  const result = await createTaskToolDefinition().execute({ description: "inspect", prompt: "inspect the files" }, {
    taskId: "test", workspaceRoot: process.cwd(), runSubagent: async () => child,
  });
  expect(result.success).toBe(false);
  expect(result.error).toContain("Subagent Task Failed");
  expect(result.error).toContain(child.failure?.trim() || "the subagent failed");
  if (child.text) {
    expect(result.error).toContain("Partial response:");
    expect(result.error).toContain(child.text);
  }
  expect(result.output).toBeUndefined();
});

it.each(["", " \n\t"])("reports an empty answer as a run failure: %j", async (text) => {
  const result = await createTaskToolDefinition().execute({ description: "inspect", prompt: "inspect" }, {
    taskId: "test", workspaceRoot: process.cwd(), runSubagent: async () => ({ ...completed, text }),
  });
  expect(result.success).toBe(false);
  expect(result.error).toContain("returned no answer");
  expect(result.error).not.toMatch(/not dispatched|no provider credential|not started/);
});

it("keeps a completed answer successful", async () => {
  const result = await createTaskToolDefinition().execute({ description: "inspect", prompt: "inspect" }, {
    taskId: "test", workspaceRoot: process.cwd(), runSubagent: async () => completed,
  });
  expect(result.success).toBe(true);
  expect(result.output).toContain("Subagent Task Completed");
  expect(result.output).toContain("answer");
  expect(result.output).not.toContain("Partial response:");
});

it("keeps an empty thrown error a failure", async () => {
  const result = await createTaskToolDefinition().execute({ description: "inspect", prompt: "inspect" }, {
    taskId: "test", workspaceRoot: process.cwd(), runSubagent: async () => { throw new Error(""); },
  });
  expect(result.success).toBe(false);
  expect(result.error).toContain("the subagent failed");
});
