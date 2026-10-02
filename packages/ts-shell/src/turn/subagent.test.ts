import { expect, it, vi } from "vitest";
import { createSubagentRunner } from "./subagent.js";
import type { StepFunction } from "./step.js";
import type { ToolGateOptions } from "./tools.js";
import { SubagentLoader } from "../core/subagents/subagentLoader.js";
import { createTaskToolDefinition } from "../core/tools/taskTool.js";

function harness(overrides: Partial<ToolGateOptions> = {}, command = "printf changed > output.txt", afterTool?: () => void) {
  const execute = vi.fn(async () => ({ success: true, output: "executed" }));
  const observations: string[] = [];
  const step: StepFunction = async (messages) => {
    const result = messages.find((message) => message.role === "tool");
    if (result) {
      observations.push(String(result.content));
      afterTool?.();
      return { text: "finished", toolCalls: [], stopReason: "stop" };
    }
    return { text: "inspect", toolCalls: [{ id: "child-1", name: "bash", args: { command } }], stopReason: "stop" };
  };
  const gate: ToolGateOptions = {
    sessionId: "session", workspaceRoot: process.cwd(), agentMode: "build", permissionScope: "allow-all",
    hooks: { dispatch: async () => ({ decision: "allow" }) } as unknown as ToolGateOptions["hooks"],
    emit: () => {}, ...overrides,
  };
  const tools = new Map([["bash", { name: "bash", description: "shell", argsSchema: {}, execute }]]);
  return { execute, observations, run: createSubagentRunner({ step, defaultMaxSteps: 3 }, tools, gate) };
}

const reviewer = new SubagentLoader().getSubagent("code-reviewer", false)!;
const request = { definition: reviewer, prompt: "review", workspace: process.cwd() };

it("build dispatches a reviewer with a real plan gate and reports its effective mode", async () => {
  const { run, execute, observations } = harness();
  const result = await createTaskToolDefinition().execute({ description: "review", prompt: "inspect files",
    subagent_type: "code-reviewer", agentMode: "build" }, { taskId: "task", workspaceRoot: process.cwd(), runSubagent: run });
  expect(execute).not.toHaveBeenCalled();
  expect(observations.join("\n")).toContain("Plan mode is active");
  expect(result.output).toContain("PLAN (Read-Only)");
});

it.each([
  ["plan", "default", "build"], ["plan", "bypassPermissions", "build"],
  ["build", "default", "plan"], ["build", "plan", undefined],
] as const)("keeps the narrowest mode for parent %s, definition %s, request %s", async (parent, declared, requested) => {
  const { run, execute } = harness({ agentMode: parent });
  const result = await run({ ...request, definition: { ...reviewer, permissionMode: declared }, agentMode: requested });
  expect(result.agentMode).toBe("plan");
  expect(execute).not.toHaveBeenCalled();
});

it("allows read-only commands through the existing plan policy", async () => {
  const { run, execute } = harness({}, "git status");
  expect((await run(request)).agentMode).toBe("plan");
  expect(execute).toHaveBeenCalledTimes(1);
});

it("preserves parent refusal rules in the new child gate", async () => {
  const { run, execute, observations } = harness({ denyRules: [{ tool: "bash" }] }, "git status");
  await run(request);
  expect(execute).not.toHaveBeenCalled();
  expect(observations.join("\n")).toMatch(/denied|blocked|refused/i);
});

it("does not turn a bypass definition into approval authority", async () => {
  const ask = vi.fn(async () => ({ promptId: "test", respondedAt: Date.now(), decision: "deny" as const }));
  const { run, execute } = harness({ permissionScope: "ask", escalationPromptHandler: ask });
  const result = await run({ ...request, definition: { ...reviewer, permissionMode: "bypassPermissions" } });
  expect(result.agentMode).toBe("build");
  expect(ask).toHaveBeenCalledTimes(1);
  expect(execute).not.toHaveBeenCalled();
});


it("keeps ordinary build inheritance usable", async () => {
  const { run, execute } = harness();
  const result = await run({ ...request, definition: { ...reviewer, permissionMode: "default" } });
  expect(result.agentMode).toBe("build");
  expect(execute).toHaveBeenCalledTimes(1);
});

it("rejects invalid task modes before delegation", async () => {
  const runSubagent = vi.fn();
  const result = await createTaskToolDefinition().execute({ description: "d", prompt: "p", agentMode: "anything" },
    { taskId: "t", workspaceRoot: process.cwd(), runSubagent });
  expect(result.success).toBe(false);
  expect(runSubagent).not.toHaveBeenCalled();
});

it("does not label an entered runner as unstarted when it throws", async () => {
  const { run: runSubagent, execute } = harness({}, undefined, () => { throw new Error("failed after tool work"); });
  const result = await createTaskToolDefinition().execute({ description: "d", prompt: "p" },
    { taskId: "t", workspaceRoot: process.cwd(), runSubagent });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(result.success).toBe(false);
  expect(result.error).toContain("not reported by runner");
  expect(result.error).not.toContain("not started");
});

it("reports cancellation inside a child tool as failed while preserving prior narration", async () => {
  const controller = new AbortController();
  const execute = vi.fn(async () => {
    controller.abort();
    return { success: false, error: "Operation aborted" };
  });
  const runSubagent = createSubagentRunner({ defaultMaxSteps: 4, step: async () => ({
    text: "I started inspecting", toolCalls: [{ id: "child", name: "read", args: {} }], stopReason: "stop",
  }) }, new Map([["read", { name: "read", description: "read", argsSchema: {}, execute }]]), {
    sessionId: "abort", workspaceRoot: process.cwd(), permissionScope: "allow-all",
    hooks: { dispatch: async () => ({ decision: "allow" }) } as unknown as ToolGateOptions["hooks"], emit: () => {},
  });
  const result = await createTaskToolDefinition().execute({ description: "inspect", prompt: "inspect files" }, {
    taskId: "abort", workspaceRoot: process.cwd(), runSubagent, abortSignal: controller.signal,
  });
  expect(execute).toHaveBeenCalledOnce();
  expect(result.success).toBe(false);
  expect(result.error).toContain("the subagent was aborted");
  expect(result.error).toContain("Partial response:\nI started inspecting");
  expect(result.error).not.toContain("Subagent Task Completed");
});
