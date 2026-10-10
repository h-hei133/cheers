import { randomUUID } from 'node:crypto';
import { adaptTools, createToolHooks, type ToolGateOptions } from './tools.js';
import type { ToolDefinition } from '../tools/types.js';
import type { AgentMessage } from '../core/agent/state.js';
import type { AgentToolResult } from '../core/agent/tools.js';
import { redactReportText } from '../core/security/redaction.js';

function publicationOutput(output: string): string {
  return redactReportText(output, 48_000, { preserveLines: true });
}

/** Direct native commands share model tool preparation, permission and hooks. */
export async function runPreparedTool(tool: ToolDefinition, input: Record<string, unknown>, options: ToolGateOptions, signal?: AbortSignal,
  id: string = randomUUID(), label = 'Native operation', publication?: { readonly eventKey: string }): Promise<AgentToolResult> {
  const pool = new Map([[tool.name, tool]]); const adapted = adaptTools(pool, options)[0]!; const hooks = createToolHooks(options, pool);
  const assistantMessage: AgentMessage = { role: 'assistant', content: [], timestamp: new Date().toISOString() };
  let observed: AgentToolResult | undefined;
  try {
    signal?.throwIfAborted();
    const args = adapted.prepareArguments!(input); const call = { id, name: tool.name, args };
    const denied = await hooks.beforeToolCall!({ call, args, assistantMessage }, signal);
    if (denied?.block) return publication ? { isError: true, output: publicationOutput(`${label} refused: ${denied.reason}`), metadata: { status: 'unchanged' } }
      : { isError: true, output: `${label} refused by its ordinary permission or hook gate.` };
    options.emit({ type: 'tool.started', toolName: tool.name, taskId: id, args: { [publication?.eventKey ?? 'operationId']: id } });
    const result = await adapted.execute(id, args, signal); observed = result;
    const update = await hooks.afterToolCall!({ call, args, assistantMessage, result, isError: result.isError }, signal);
    const settled = { ...result, ...update, ...(publication ? { metadata: { ...result.metadata, ...update?.metadata,
      ...(update?.isError && result.metadata?.status !== 'unchanged' ? { publication: result.metadata?.status, status: 'unverified' } : {}) } }
      : update?.metadata ? { metadata: { ...result.metadata, ...update.metadata } } : {}) };
    if (publication) settled.output = publicationOutput(settled.output);
    options.emit({ type: 'tool.result', toolName: tool.name, taskId: id, success: !settled.isError, output: settled.output });
    return settled;
  } catch (error) {
    if (publication) {
      const result = { isError: true, output: publicationOutput(observed ? `${observed.output}\n${label} after-call verification is unverified; actual publication evidence remains visible.`
        : error instanceof Error ? error.message : `${label} refused.`), metadata: { ...observed?.metadata,
          ...(observed ? { publication: observed.metadata?.status } : {}), status: observed ? 'unverified' : 'unchanged' } };
      if (observed) options.emit({ type: 'tool.result', toolName: tool.name, taskId: id, success: false, output: result.output });
      return result;
    }
    return observed ? { ...observed, isError: true, output: `${observed.output}\n${label} after-call hooks or publication failed; actual effect evidence remains visible.` }
      : { isError: true, output: `${label} was blocked or its result could not be confirmed.` };
  }
}
