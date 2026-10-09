import { runSubagent, type SubagentRunner } from "../core/subagents/runner.js";
import { subagentMode } from "../core/subagents/boundary.js";
import { delegationTools } from '../core/subagents/capability.js';
import type { ToolDefinition } from "../tools/types.js";
import type { StepFunction } from "./step.js";
import { adaptTools, createToolHooks, type ToolGateOptions } from "./tools.js";
import type { AgentLoopConfig } from '../core/agent/loop.js';

export interface SubagentHost {
  readonly step: StepFunction;
  readonly defaultMaxSteps: number;
  readonly retry?: AgentLoopConfig['retry'];
  readonly stepForModel?: (model: string, admission?: () => string | undefined, effort?: import('../core/models/effort.js').ThinkingPreference) => StepFunction | Promise<StepFunction>;
}

/** Bind each delegated run to the parent's policies and its own narrower mode. */
export function createSubagentRunner(
  host: SubagentHost,
  tools: ReadonlyMap<string, ToolDefinition>,
  parent: ToolGateOptions,
): SubagentRunner {
  return async (input) => {
    if (input.capability) {
      try {
        const allowed = delegationTools(input.capability, tools, parent.denyRules, input.definition.name);
        const declared = input.definition.tools;
        input = { ...input, agentMode: 'plan', definition: { ...input.definition, permissionMode: 'plan',
          tools: allowed.filter(name => !declared || declared.includes(name)),
          maxTurns: Math.min(input.definition.maxTurns ?? input.capability.maxSteps, input.capability.maxSteps) } };
      } catch { return { text: '', failed: true, failure: 'Read-only delegation admission refused.', steps: 0, allowedTools: [] }; }
    }
    let step: StepFunction | undefined;
    try { step = input.definition.model || input.definition.effort !== undefined || input.admission && host.stepForModel
      ? await host.stepForModel?.(input.definition.model ?? '', input.admission, input.definition.effort) : host.step; }
    catch { return { text: '', failed: true, failure: 'Requested delegated model is unavailable.', steps: 0, allowedTools: [] }; }
    if (!step) return { text: '', failed: true, failure: 'Requested delegated model is unavailable.', steps: 0, allowedTools: [] };
    const agentMode = subagentMode(parent.agentMode, input.definition.permissionMode, input.agentMode);
    const gate = { ...parent, workspaceRoot: input.workspace, agentMode,
      admission: () => parent.admission?.() ?? input.admission?.(),
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
