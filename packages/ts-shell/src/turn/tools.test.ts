import { describe, expect, it, vi } from "vitest";
import type { HookDispatcher } from "../core/hooks/hookDispatcher.js";
import type { AgentMessage } from "../core/agent/state.js";
import type { ToolDefinition } from "../tools/types.js";
import { adaptTools, createToolHooks, PARSE_ERROR_KEY, type ToolGateOptions } from "./tools.js";

/**
 * The gate decides what a tool call may do before the kernel runs it. Each
 * refusal is a message to the model, so the wording is part of the contract.
 */

const assistant: AgentMessage = { role: "assistant", content: "" };

function gate(overrides: Partial<ToolGateOptions> = {}): ToolGateOptions & { events: unknown[]; dispatched: string[] } {
  const events: unknown[] = [];
  const dispatched: string[] = [];
  const hooks = {
    dispatch: async (payload: { eventName: string }) => {
      dispatched.push(payload.eventName);
      return { decision: "allow" as const };
    },
  } as unknown as HookDispatcher;
  return {
    events,
    dispatched,
    sessionId: "sess_gate",
    workspaceRoot: process.cwd(),
    hooks,
    emit: (event) => events.push(event),
    ...overrides,
  };
}

function call(name: string, args: Record<string, unknown> = {}) {
  return { assistantMessage: assistant, call: { id: `call_${name}`, name, args }, args };
}

describe("createToolHooks", () => {
  it("blocks mutation in plan mode but lets read-only shell commands through", async () => {
    const hooks = createToolHooks(gate({ agentMode: "plan", permissionScope: "allow-all" }));
    const blocked = await hooks.beforeToolCall!(call("write", { path: "a" }));
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toContain("Plan mode is active");
    expect(await hooks.beforeToolCall!(call("bash", { command: "git status" }))).toBeUndefined();
  });

  it("asks before a write in ask mode and carries the user's denial reason to the model", async () => {
    const escalationPromptHandler = vi.fn(async (prompt: { id: string }) => ({
      promptId: prompt.id,
      decision: "deny" as const,
      respondedAt: 1,
      userComment: "User denied with reason: use notes.md instead",
    }));
    const setup = gate({ permissionScope: "ask", escalationPromptHandler });
    const hooks = createToolHooks(setup);
    expect(await hooks.beforeToolCall!(call("read", { path: "a" }))).toBeUndefined();
    const denied = await hooks.beforeToolCall!(call("write", { path: "a" }));
    expect(escalationPromptHandler).toHaveBeenCalledOnce();
    expect(denied?.reason).toContain('User feedback / instructions: "use notes.md instead"');
    expect(setup.events).toEqual([
      { type: "approval.requested", toolName: "write", taskId: "call_write" },
      { type: "approval.resolved", toolName: "write", taskId: "call_write", outcome: "denied" },
    ]);
  });

  it("annotates an approved result with the decision that allowed it", async () => {
    const setup = gate({
      permissionScope: "ask",
      escalationPromptHandler: async (prompt) => ({ promptId: prompt.id, decision: "allow-once", respondedAt: 1 }),
    });
    const hooks = createToolHooks(setup);
    const context = call("write", { path: "a" });
    expect(await hooks.beforeToolCall!(context)).toBeUndefined();
    const after = await hooks.afterToolCall!({ ...context, result: { output: "wrote a", isError: false }, isError: false });
    expect(after?.output).toBe("[User approved write operation (allow-once)]\nwrote a");
    expect(setup.dispatched).toEqual(["PreToolUse", "PostToolUse"]);
  });

  it("stops a model that repeats the same call three times", async () => {
    const hooks = createToolHooks(gate({ permissionScope: "allow-all" }));
    await hooks.beforeToolCall!(call("read", { path: "a" }));
    await hooks.beforeToolCall!(call("read", { path: "a" }));
    const third = await hooks.beforeToolCall!(call("read", { path: "a" }));
    expect(third?.reason).toContain("Doom Loop detected");
  });
});

describe("adaptTools", () => {
  const registry = new Map<string, ToolDefinition>([
    [
      "echo",
      {
        name: "echo",
        description: "echo",
        argsSchema: { type: "object", properties: {} },
        permissions: { check: () => [] },
        execute: async (args) => ({ success: true, output: String(args.text) }),
      },
    ],
  ]);

  it("runs the registry tool and reports its output", async () => {
    const [tool] = adaptTools(registry, gate());
    const result = await tool.execute("call_1", { text: "hi" });
    expect(result).toEqual({ output: "hi", isError: false });
  });

  it("refuses arguments the model could not be parsed from", () => {
    const [tool] = adaptTools(registry, gate());
    expect(() => tool.prepareArguments!({ [PARSE_ERROR_KEY]: "Unexpected token" })).toThrow(/Malformed JSON arguments/);
  });
});
