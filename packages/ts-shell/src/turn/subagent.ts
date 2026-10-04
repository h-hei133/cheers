import { runSubagent, type SubagentRunner } from "../core/subagents/runner.js";
import { subagentMode } from "../core/subagents/boundary.js";
import type { ToolDefinition } from "../tools/types.js";
import type { StepFunction } from "./step.js";
import { adaptTools, createToolHooks, type ToolGateOptions } from "./tools.js";

/** Bind each delegated run to the parent's policies and its own narrower mode. */
export function createSubagentRunner(
  host: { readonly step: StepFunction; readonly defaultMaxSteps: number },
  tools: ReadonlyMap<string, ToolDefinition>,
  parent: ToolGateOptions,
): SubagentRunner {
  return async (input) => {
    const agentMode = subagentMode(parent.agentMode, input.definition.permissionMode, input.agentMode);
    const gate = { ...parent, workspaceRoot: input.workspace, agentMode };
    const hooks = createToolHooks(gate, tools);
    const result = await runSubagent(input, {
      tools: new Map(adaptTools(tools, gate).map((tool) => [tool.name, tool])),
      step: (messages, signal, options) => host.step(messages, signal, {}, { ...options, agentMode }),
      beforeToolCall: hooks.beforeToolCall,
      afterToolCall: hooks.afterToolCall,
      defaultMaxSteps: host.defaultMaxSteps,
    });
    return { ...result, agentMode };
  };
}
