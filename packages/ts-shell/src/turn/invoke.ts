import { randomUUID } from 'node:crypto';
import { adaptTools, createToolHooks, type ToolGateOptions } from './tools.js';
import type { ToolDefinition } from '../tools/types.js';
import type { AgentMessage } from '../core/agent/state.js';
import type { AgentToolResult } from '../core/agent/tools.js';

/** Direct native commands share model tool preparation, permission and hooks. */
export async function runPreparedTool(tool: ToolDefinition, input: Record<string, unknown>, options: ToolGateOptions, signal?: AbortSignal,
  id = randomUUID(), label = 'Native operation'): Promise<AgentToolResult> {
  const pool = new Map([[tool.name, tool]]); const adapted = adaptTools(pool, options)[0]!; const hooks = createToolHooks(options, pool);
  const assistantMessage: AgentMessage = { role: 'assistant', content: [], timestamp: new Date().toISOString() };
  let observed: AgentToolResult | undefined;
  try {
    const args = adapted.prepareArguments!(input); const call = { id, name: tool.name, args };
    const denied = await hooks.beforeToolCall!({ call, args, assistantMessage }, signal);
    if (denied?.block) return { isError: true, output: `${label} refused by its ordinary permission or hook gate.` };
    options.emit({ type: 'tool.started', toolName: tool.name, taskId: id, args: { operationId: id } });
    const result = await adapted.execute(id, args, signal); observed = result;
    const update = await hooks.afterToolCall!({ call, args, assistantMessage, result, isError: result.isError }, signal);
    const settled = { ...result, ...update, ...(update?.metadata ? { metadata: { ...result.metadata, ...update.metadata } } : {}) };
    options.emit({ type: 'tool.result', toolName: tool.name, taskId: id, success: !settled.isError, output: settled.output });
    return settled;
  } catch { return observed ? { ...observed, isError: true, output: `${observed.output}\n${label} after-call hooks or publication failed; actual effect evidence remains visible.` }
    : { isError: true, output: `${label} was blocked or its result could not be confirmed.` }; }
}
