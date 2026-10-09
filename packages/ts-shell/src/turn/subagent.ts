import { runSubagent, type SubagentRunner } from "../core/subagents/runner.js";
import { subagentMode } from "../core/subagents/boundary.js";
import type { ToolDefinition } from "../tools/types.js";
import type { StepFunction } from "./step.js";
import { adaptTools, createToolHooks, type ToolGateOptions } from "./tools.js";
import type { AgentLoopConfig } from '../core/agent/loop.js';

export interface SubagentHost {
  readonly step: StepFunction;
  readonly defaultMaxSteps: number;
  readonly retry?: AgentLoopConfig['retry'];
  readonly stepForModel?: (model: string, admission?: () => string | undefined) => StepFunction | Promise<StepFunction>;
}

/** Bind each delegated run to the parent's policies and its own narrower mode. */
export function createSubagentRunner(
  host: SubagentHost,
  tools: ReadonlyMap<string, ToolDefinition>,
  parent: ToolGateOptions,
): SubagentRunner {
  return async (input) => {
    let step: StepFunction | undefined;
    try { step = input.definition.model ? await host.stepForModel?.(input.definition.model, input.admission) : host.step; }
    catch { return { text: '', failed: true, failure: 'Requested delegated model is unavailable.', steps: 0, allowedTools: [] }; }
    if (!step) return { text: '', failed: true, failure: 'Requested delegated model is unavailable.', steps: 0, allowedTools: [] };
    const agentMode = subagentMode(parent.agentMode, input.definition.permissionMode, input.agentMode);
    const gate = { ...parent, workspaceRoot: input.workspace, agentMode,
      workspaceRoots: input.workspace === parent.workspaceRoot ? parent.workspaceRoots : undefined };
    const hooks = createToolHooks(gate, tools);
    const result = await runSubagent(input, {
      tools: new Map(adaptTools(tools, gate).map((tool) => [tool.name, tool])),
      step: (messages, signal, options) => step(messages, signal, {}, { ...options, agentMode }),
      beforeToolCall: hooks.beforeToolCall,
      afterToolCall: hooks.afterToolCall,
      defaultMaxSteps: host.defaultMaxSteps,
      retry: host.retry,
    });
    return { ...result, agentMode };
  };
}
