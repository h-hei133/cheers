import { randomUUID } from 'node:crypto';
import { adaptTools, createToolHooks, type ToolGateOptions } from '../../turn/tools.js';
import type { ToolDefinition } from '../../tools/types.js';
import type { AgentMessage } from '../../core/agent/state.js';
import type { AgentToolResult } from '../../core/agent/tools.js';

export async function runSecurityTool(tool: ToolDefinition, input: Record<string, unknown>, options: ToolGateOptions, signal?: AbortSignal,
  id: string = randomUUID()): Promise<AgentToolResult> {
  const pool = new Map([[tool.name, tool]]); const adapted = adaptTools(pool, options)[0]!; const hooks = createToolHooks(options, pool);
  const assistantMessage: AgentMessage = { role: 'assistant', content: [], timestamp: new Date().toISOString() };
  let observed: AgentToolResult | undefined;
  try {
    const args = await adapted.prepareArguments!(input, signal); const call = { id, name: tool.name, args };
    signal?.throwIfAborted();
    const denied = await hooks.beforeToolCall!({ call, args, assistantMessage }, signal);
    if (denied?.block) return { isError: true, output: 'Security operation refused by its ordinary permission or hook gate.' };
    options.emit({ type: 'tool.started', toolName: tool.name, taskId: id, args: { securityOperation: id } });
    const result = await adapted.execute(id, args, signal); observed = result;
    await hooks.afterToolCall!({ call, args, assistantMessage, result, isError: result.isError }, signal);
    options.emit({ type: 'tool.result', toolName: tool.name, taskId: id, success: !result.isError, output: result.output });
    return result;
  } catch { return observed ? { ...observed, isError: true, output: `${observed.output}\nSecurity after-call hooks or publication failed; actual effect evidence remains visible.` }
    : { isError: true, output: 'Security operation was blocked or its result could not be confirmed.' }; }
}
