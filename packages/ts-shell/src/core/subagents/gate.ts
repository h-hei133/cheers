import { randomUUID } from 'node:crypto';
import type { ToolDefinition } from '../../tools/types.js';
import { adaptTools, createToolHooks, type ToolGateOptions } from '../../turn/tools.js';
import type { AgentMessage } from '../agent/state.js';
import type { AgentToolResult } from '../agent/tools.js';

export async function publishAgent(tool: ToolDefinition, options: ToolGateOptions): Promise<AgentToolResult> {
  const pool = new Map([[tool.name, tool]]); const adapted = adaptTools(pool, options)[0]!; const hooks = createToolHooks(options, pool);
  const id = randomUUID(); const assistantMessage: AgentMessage = { role: 'assistant', content: [], timestamp: new Date().toISOString() };
  let observed: AgentToolResult | undefined;
  try {
    const args = adapted.prepareArguments!({}); const call = { id, name: tool.name, args };
    const decision = await hooks.beforeToolCall!({ call, args, assistantMessage });
    if (decision?.block) return { isError: true, output: `Agent publication refused: ${decision.reason}`, metadata: { status: 'unchanged' } };
    options.emit({ type: 'tool.started', toolName: tool.name, taskId: id, args: { agentPublication: id } });
    observed = await adapted.execute(id, args);
    const after = await hooks.afterToolCall!({ call, args, assistantMessage, result: observed, isError: observed.isError });
    const result = { ...observed, ...after, metadata: { ...observed.metadata, ...after?.metadata,
      ...(after?.isError && observed.metadata?.status !== 'unchanged' ? { publication: observed.metadata?.status, status: 'unverified' } : {}) } };
    options.emit({ type: 'tool.result', toolName: tool.name, taskId: id, success: !result.isError, output: result.output });
    return result;
  } catch (error) {
    const result = { isError: true, output: observed ? `${observed.output}\nAgent after-call verification is unverified; actual publication evidence remains visible.`
      : error instanceof Error ? error.message : 'Agent publication refused.', metadata: { ...observed?.metadata,
        ...(observed ? { publication: observed.metadata?.status } : {}), status: observed ? 'unverified' : 'unchanged' } };
    if (observed) options.emit({ type: 'tool.result', toolName: tool.name, taskId: id, success: false, output: result.output });
    return result;
  }
}
