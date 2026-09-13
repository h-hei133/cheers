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

  it("blocks subagent dispatch and mutating browser actions in plan mode", async () => {
    const hooks = createToolHooks(gate({ agentMode: "plan", permissionScope: "allow-all" }));
    const task = await hooks.beforeToolCall!(call("task", { description: "explore" }));
    expect(task?.block).toBe(true);
    expect(task?.reason).toContain("Plan mode is active");
    const click = await hooks.beforeToolCall!(call("browser", { action: "click", url: "https://x" }));
    expect(click?.block).toBe(true);
    expect(await hooks.beforeToolCall!(call("browser", { action: "observe", url: "https://x" }))).toBeUndefined();
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

  it("does not count denied calls toward the doom loop", async () => {
    const escalationPromptHandler = vi.fn(async (prompt: { id: string }) => ({
      promptId: prompt.id,
      decision: "deny" as const,
      respondedAt: 1,
    }));
    const hooks = createToolHooks(gate({ permissionScope: "ask", escalationPromptHandler }));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const denied = await hooks.beforeToolCall!(call("write", { path: "a" }));
      expect(denied?.reason).toContain("User denied permission");
    }
  });

  it("blocks when a PreToolUse hook returns block", async () => {
    const setup = gate({ permissionScope: "allow-all" });
    setup.hooks = {
      dispatch: async (payload: { eventName: string }) => {
        setup.dispatched.push(payload.eventName);
        return payload.eventName === "PreToolUse" ? { decision: "block", reason: "policy says no" } : { decision: "allow" };
      },
    } as unknown as HookDispatcher;
    const hooks = createToolHooks(setup);
    const blocked = await hooks.beforeToolCall!(call("read", { path: "a" }));
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toContain("policy says no");
  });

  it("appends PostToolUse feedback to the result", async () => {
    const setup = gate({ permissionScope: "allow-all" });
    setup.hooks = {
      dispatch: async () => ({ decision: "allow", feedback: "fix the import" }),
    } as unknown as HookDispatcher;
    const hooks = createToolHooks(setup);
    await hooks.beforeToolCall!(call("read", { path: "a" }));
    const after = await hooks.afterToolCall!({ ...call("read", { path: "a" }), result: { output: "ok", isError: false }, isError: false });
    expect(after?.output).toContain("fix the import");
  });

  it("blocks writes when no interactive handler exists", async () => {
    const hooks = createToolHooks(gate({ permissionScope: "ask", escalationPromptHandler: undefined }));
    const blocked = await hooks.beforeToolCall!(call("write", { path: "a" }));
    expect(blocked?.block).toBe(true);
    expect(blocked?.reason).toContain("no interactive handler");
  });

  it("reports abort when the signal fires during approval", async () => {
    const controller = new AbortController();
    const hooks = createToolHooks(
      gate({
        permissionScope: "ask",
        escalationPromptHandler: async () => {
          controller.abort();
          return { promptId: "p", decision: "allow-once" as const, respondedAt: 1 };
        },
      }),
    );
    const blocked = await hooks.beforeToolCall!(call("write", { path: "a" }), controller.signal);
    expect(blocked?.reason).toBe("Operation aborted");
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
