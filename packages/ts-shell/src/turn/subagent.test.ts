import { expect, it, vi } from "vitest";
import { createSubagentRunner } from "./subagent.js";
import type { StepFunction } from "./step.js";
import { createStepFunction } from "./step.js";
import type { ToolGateOptions } from "./tools.js";
import { toolSchemas } from "./tools.js";
import { SubagentLoader } from "../core/subagents/subagentLoader.js";
import { createTaskToolDefinition } from "../core/tools/taskTool.js";
import { createToolDiscovery } from "../core/tools/discovery/state.js";
import { discoveryTools } from "../core/tools/discovery/tools.js";
import type { ToolDefinition } from "../tools/types.js";

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

it("keeps MCP read-only eligibility in the delegated plan gate", async () => {
  const execute = vi.fn(async () => ({ success: true, output: "found note" }));
  const tools = new Map([["notes__lookup", { name: "notes__lookup", description: "find notes", argsSchema: {},
    mcpAnnotations: { readOnlyHint: true }, execute }]]);
  const step: StepFunction = async messages => messages.some(message => message.role === "tool")
    ? { text: "finished", toolCalls: [], stopReason: "stop" }
    : { text: "", toolCalls: [{ id: "lookup", name: "notes__lookup", args: {} }], stopReason: "stop" };
  const run = createSubagentRunner({ step, defaultMaxSteps: 3 }, tools, {
    sessionId: "session", workspaceRoot: process.cwd(), agentMode: "plan", permissionScope: "allow-all",
    hooks: { dispatch: async () => ({ decision: "allow" }) } as unknown as ToolGateOptions["hooks"], emit: () => {},
  });
  expect((await run({ ...request, definition: { ...reviewer, tools: ["notes__lookup"] } })).agentMode).toBe("plan");
  expect(execute).toHaveBeenCalledOnce();
});

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
  const { run, execute } = harness({}, "git branch --show-current");
  expect((await run(request)).agentMode).toBe("plan");
  expect(execute).toHaveBeenCalledTimes(1);
});

it("preserves parent refusal rules in the new child gate", async () => {
  const { run, execute, observations } = harness({ denyRules: [{ tool: "bash" }] }, "git branch --show-current");
  await run(request);
  expect(execute).not.toHaveBeenCalled();
  expect(observations.join("\n")).toMatch(/denied|blocked|refused/i);
});

it.each(["git status", "git diff", "git show HEAD", "git log -n 5"])("blocks helper-capable %s in a plan child", async command => {
  const { run, execute, observations } = harness({}, command);
  expect((await run(request)).agentMode).toBe("plan");
  expect(execute).not.toHaveBeenCalled();
  expect(observations.join("\n")).toContain("Plan mode is active");
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

it("gives the model the executable child tool set without changing the shared parent step", async () => {
  const read = vi.fn(async () => ({ success: true, output: "file contents" }));
  const tools = new Map(["read", "write", "task"].map((name) => [name, {
    name, description: name, argsSchema: {}, execute: name === "read" ? read : vi.fn(),
  }]));
  const bodies: Array<{ tools?: Array<{ function: { name: string } }> }> = [];
  const step = createStepFunction({
    provider: { headers: {}, baseUrl: "https://provider.test/v1", model: "test" },
    workspaceRoot: process.cwd(), sessionId: "schemas", systemPrompt: "inspect", tools: toolSchemas(tools),
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ choices: [{ message: bodies.length === 1 ? {
        content: "reading", tool_calls: [{ id: "read-1", type: "function", function: { name: "read", arguments: "{}" } }],
      } : { content: "done" }, finish_reason: "stop" }] }), { headers: { "content-type": "application/json" } });
    },
  });
  const run = createSubagentRunner({ step, defaultMaxSteps: 2 }, tools, {
    sessionId: "schemas", workspaceRoot: process.cwd(), permissionScope: "allow-all",
    hooks: { dispatch: async () => ({ decision: "allow" }) } as unknown as ToolGateOptions["hooks"], emit: () => {},
  });
  const result = await run({ ...request, definition: { ...reviewer, tools: ["read", "write", "task"], disallowedTools: ["write"] } });
  expect(result.allowedTools).toEqual(["read"]);
  expect(bodies[0].tools?.map((tool) => tool.function.name)).toEqual(["read"]);
  expect(bodies[1].tools).toBeUndefined();
  expect(read).toHaveBeenCalledOnce();
  await step([{ role: "user", content: "parent request" }], undefined, {}, { allowTools: true });
  expect(bodies[2].tools?.map((tool) => tool.function.name)).toEqual(["read", "write", "task"]);
});

it("scopes ordinary and script discovery to the child gate without opening the parent catalog", async () => {
  const workspaceRoot = process.cwd();
  const fixtureTool = (name: string): ToolDefinition => ({ name, description: "Fixture data", argsSchema: { type: "object" },
    execute: vi.fn(async () => ({ success: true, output: name })) });
  const allowed = fixtureTool("child_record");
  const deferred = fixtureTool("child_nested");
  const forbidden = fixtureTool("mcp__notes__parent_record");
  const parentReady = vi.fn(async () => true);
  const parent = createToolDiscovery({ catalog: new Map([allowed, deferred, forbidden].map(tool => [tool.name, tool])) });
  const controls = discoveryTools(parent, parentReady);
  const pool = new Map([allowed, forbidden, ...controls].map(tool => [tool.name, tool]));
  const nested = new Map([...pool, [deferred.name, deferred]]);
  const script: ToolDefinition = { name: "codemode", description: "Fixture script", argsSchema: { type: "object" },
    nestedToolCatalog: () => nested,
    async execute(_args, context) {
      const invoke = context.executeNestedTool!;
      const search = await invoke("tool_search", { query: "fixture" }, "script/search");
      const admitted = await invoke(deferred.name, {}, "script/allowed");
      const denied = await invoke(forbidden.name, {}, "script/blocked");
      return { success: search.success && admitted.success && !denied.success,
        output: JSON.stringify({ search: JSON.parse(search.output!), called: admitted.output, refused: !denied.success }) };
    } };
  pool.set(script.name, script);
  nested.set(script.name, script);

  const reports: string[] = [];
  const step: StepFunction = async messages => {
    const results = messages.filter(message => message.role === "tool");
    if (results.length === 0) return { text: "", stopReason: "stop", toolCalls: [
      { id: "search", name: "tool_search", args: { query: "fixture" } },
      { id: "load", name: "tool_load", args: { names: [allowed.name, deferred.name, forbidden.name] } },
    ] };
    if (results.length === 2) return { text: "", stopReason: "stop", toolCalls: [{ id: "script", name: "codemode", args: {} }] };
    reports.push(...results.map(result => String(result.content)));
    return { text: "finished", stopReason: "stop", toolCalls: [] };
  };
  const run = createSubagentRunner({ step, defaultMaxSteps: 4 }, pool, {
    sessionId: "child-discovery", workspaceRoot, permissionScope: "allow-all", agentMode: "build",
    hooks: { dispatch: async () => ({ decision: "allow" }) } as ToolGateOptions["hooks"], emit() {},
  });
  const result = await run({ ...request, definition: { ...reviewer, maxTurns: 4, permissionMode: "default",
    tools: [allowed.name, deferred.name, "tool_search", "tool_load", "codemode"] } });

  expect(result.failed).toBe(false);
  expect(result.allowedTools).toEqual([allowed.name, "tool_search", "tool_load", "codemode"]);
  expect(JSON.parse(reports[0]!).matches.map((match: { name: string }) => match.name).sort()).toEqual([allowed.name, "codemode"]);
  expect(JSON.parse(reports[1]!)).toMatchObject({ loaded: [allowed.name], rejected: [deferred.name, forbidden.name] });
  const scriptReport = JSON.parse(reports[2]!);
  expect(scriptReport).toMatchObject({ called: deferred.name, refused: true });
  expect(scriptReport.search.matches.map((match: { name: string }) => match.name).sort()).toEqual([deferred.name, allowed.name]);
  expect(parentReady).not.toHaveBeenCalled();
  expect(forbidden.execute).not.toHaveBeenCalled();
});

it('refuses an unavailable explicit model with zero main-step fallback', async () => {
  const main = vi.fn(); const run = createSubagentRunner({ step: main, defaultMaxSteps: 1 }, new Map(), {
    sessionId: 'model-unavailable', workspaceRoot: process.cwd(), permissionScope: 'ask', hooks: {} as ToolGateOptions['hooks'], emit: () => {},
  });
  expect(await run({ ...request, definition: { ...reviewer, model: 'openai/exact-unavailable' } })).toMatchObject({ failed: true, steps: 0, failure: 'Requested delegated model is unavailable.' });
  expect(main).not.toHaveBeenCalled();
});

it.each(['missing', 'changed'])('refuses a %s native role without using the generic subagent policy', async change => {
  const role = { connectionId: 'review', provider: 'openai', model: 'review-model', thinkingEffort: 'high' as const };
  const main = vi.fn(); const select = vi.fn();
  const run = createSubagentRunner({ step: main, stepForModel: select, defaultMaxSteps: 1, defaultModel: role,
    modelRoles: change === 'missing' ? {} : { advisor: { ...role, thinkingEffort: 'low' } } }, new Map(), {
    sessionId: 'model-role', workspaceRoot: process.cwd(), permissionScope: 'ask', hooks: {} as ToolGateOptions['hooks'], emit: () => {},
  });
  expect(await run({ ...request, modelRole: { name: 'advisor', identity: JSON.stringify(role) } }))
    .toMatchObject({ failed: true, steps: 0, failure: 'Requested delegated role is unavailable or changed.' });
  expect(main).not.toHaveBeenCalled(); expect(select).not.toHaveBeenCalled();
});

it('enforces a default-model delegated admission fence before startup and each native request', async () => {
  const main = vi.fn(async () => ({ text: 'reading', toolCalls: [{ id: 'read', name: 'read', args: {} }], stopReason: 'stop' as const }));
  let refusal: string | undefined = 'initially fenced';
  const execute = vi.fn(async () => { refusal = 'fenced after tool'; return { success: true, output: 'evidence' }; });
  const run = createSubagentRunner({ step: main, defaultMaxSteps: 3 }, new Map([['read', { name: 'read', description: 'read', argsSchema: {}, execute }]]), {
    sessionId: 'admission', workspaceRoot: process.cwd(), agentMode: 'plan', permissionScope: 'allow-all',
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as ToolGateOptions['hooks'], emit: () => {},
  });
  const input = { ...request, definition: { ...reviewer, tools: ['read'] }, admission: () => refusal };
  expect(await run(input)).toMatchObject({ failed: true, steps: 0 }); expect(main).not.toHaveBeenCalled();
  refusal = undefined; expect(await run(input)).toMatchObject({ failed: true, steps: 1, failure: 'Delegated request admission refused.' });
  expect(main).toHaveBeenCalledOnce(); expect(execute).toHaveBeenCalledOnce();
});
