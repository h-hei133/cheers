import { runSubagent, type SubagentRunner, type SubagentRunResult, type SubagentPreparation } from "../core/subagents/runner.js";
import { subagentMode } from "../core/subagents/boundary.js";
import { delegationTools } from '../core/subagents/capability.js';
import type { ToolDefinition } from "../tools/types.js";
import type { StepFunction } from "./step.js";
import { adaptTools, createToolHooks, type ToolGateOptions } from "./tools.js";
import type { AgentLoopConfig } from '../core/agent/loop.js';
import type { SessionModelRole } from '../session/model/contract.js';

export interface SubagentHost {
  readonly step: StepFunction;
  readonly defaultMaxSteps: number;
  readonly retry?: AgentLoopConfig['retry'];
  readonly defaultModel?: SessionModelRole;
  readonly modelRoles?: Readonly<Record<string, SessionModelRole | undefined>>;
  /**
   * Whether the target model accepts tool declarations at all.
   *
   * The instruction names the tools the subagent may use, and the request is
   * what decides whether any reach the model. A model the catalogue marks as
   * taking none would otherwise be told about tools it can never call. Absent
   * means capable, which is what every delegating run assumed before the
   * catalogue could say otherwise.
   */
  readonly acceptsTools?: (model: string | SessionModelRole | undefined) => boolean;
  readonly stepForModel?: (model: string | SessionModelRole, admission?: () => string | undefined, effort?: import('../core/models/effort.js').ThinkingPreference, workspace?: string) => StepFunction | Promise<StepFunction>;
  readonly prepareModel?: (model: string | SessionModelRole, admission?: () => string | undefined, effort?: import('../core/models/effort.js').ThinkingPreference, workspace?: string,
    publication?: SubagentPreparation['accountPublication']) => Promise<void>;
}

/** Bind each delegated run to the parent's policies and its own narrower mode. */
export function createSubagentRunner(
  host: SubagentHost,
  tools: ReadonlyMap<string, ToolDefinition>,
  parent: ToolGateOptions,
): SubagentRunner {
  const select = (input: SubagentPreparation) => {
    const admission = () => input.signal?.aborted ? 'Delegated request cancelled.' : parent.admission?.() ?? input.admission?.();
    const refused = admission(); if (refused) throw new Error(refused);
    const role = input.modelRole ? host.modelRoles?.[input.modelRole.name] : host.defaultModel;
    if (!input.definition.model && input.modelRole && (!role || JSON.stringify(role) !== input.modelRole.identity)) {
      throw new Error('Requested delegated role is unavailable or changed.');
    }
    const model = input.definition.model ?? role;
    const effort = input.definition.effort !== undefined ? input.definition.effort
      : !input.definition.model && role ? role.thinkingEffort ?? null : undefined;
    const selection: SubagentRunResult['selection'] = { model: typeof model === 'string' ? model : model ? `${model.connectionId}/${model.model}` : undefined,
      effort, source: input.definition.model ? 'definition' : role ? 'session-role' : 'parent' };
    return { model, effort, selection, admission };
  };
  const runner: SubagentRunner = async (input) => {
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
    let selected: ReturnType<typeof select>;
    try { selected = select(input); }
    catch { return { text: '', failed: true, failure: 'Requested delegated role is unavailable or changed.', steps: 0, allowedTools: [] }; }
    const { model, effort, selection, admission } = selected;
    try { step = model || effort !== undefined || (input.admission || parent.configScope && input.workspace !== parent.workspaceRoot) && host.stepForModel
      ? await host.stepForModel?.(model ?? '', admission, effort, input.workspace) : host.step; }
    catch { return { selection, text: '', failed: true, failure: 'Requested delegated model is unavailable.', steps: 0, allowedTools: [] }; }
    if (!step) return { selection, text: '', failed: true, failure: 'Requested delegated model is unavailable.', steps: 0, allowedTools: [] };
    const agentMode = subagentMode(parent.agentMode, input.definition.permissionMode, input.agentMode);
    const gate = { ...parent, workspaceRoot: input.workspace, agentMode,
      admission: () => parent.admission?.() ?? input.admission?.(),
      workspaceRoots: input.workspace === parent.workspaceRoot ? parent.workspaceRoots : undefined };
    const hooks = createToolHooks(gate, tools);
    const result = await runSubagent(input, {
      tools: new Map(adaptTools(tools, gate).map((tool) => [tool.name, tool])),
      step: (messages, signal, options) => step(messages, signal, {}, { ...options, agentMode }),
      ...(host.acceptsTools ? { acceptsTools: host.acceptsTools(model) } : {}),
      beforeToolCall: hooks.beforeToolCall,
      afterToolCall: hooks.afterToolCall,
      defaultMaxSteps: host.defaultMaxSteps,
      retry: host.retry,
    });
    return { ...result, agentMode, selection };
  };
  return Object.assign(runner, { prepare: async (input: SubagentPreparation): Promise<void> => {
    const { model, effort, admission } = select(input);
    await host.prepareModel?.(model ?? '', admission, effort, input.workspace, input.accountPublication);
    const refused = admission(); if (refused) throw new Error(refused);
  } });
}
