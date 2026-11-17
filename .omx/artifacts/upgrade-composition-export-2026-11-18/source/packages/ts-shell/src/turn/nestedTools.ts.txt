import { finalizeExecutedCall, type AgentToolResult, type ToolHooks } from '../core/agent/tools.js';
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../tools/types.js';
import { toolExecutionMode } from './execution.js';

export interface GatedToolExecutorHost {
  readonly tools: ReadonlyMap<string, ToolDefinition>
  readonly hooks: ToolHooks
  readonly prepare: (
    tool: ToolDefinition,
    args: Record<string, unknown>,
    signal: AbortSignal | undefined,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>
  readonly execute: (
    tool: ToolDefinition,
    callId: string,
    args: Record<string, unknown>,
    signal: AbortSignal | undefined,
  ) => Promise<AgentToolResult>
  /** Retire the original preparation/file-scope bindings on every exit. */
  readonly cleanup?: (tool: ToolDefinition, args: Record<string, unknown>, signal: AbortSignal | undefined) => void
}

/** Nested calls retain the parent gate and own their cancellation and complete settlement. */
export function createGatedNestedToolExecutor(
  host: GatedToolExecutorHost,
  parentSignal: AbortSignal | undefined,
): NonNullable<ToolExecutionContext['executeNestedTool']> {
  let sequential: Promise<void> = Promise.resolve();
  const active = new Set<Promise<void>>();
  return async (name, rawArgs, callId, childSignal) => {
    if (name === 'codemode') {
      return { success: false, error: 'Recursive codemode calls are not allowed.' };
    }
    const target = host.tools.get(name);
    if (!target) {
      return { success: false, error: `Unknown tool '${name}'.` };
    }
    const owned = nestedSignal(parentSignal, childSignal);
    const run = () => executeNested(host, target, rawArgs, callId, owned.signal);
    const isSequential = toolExecutionMode(target) === 'sequential';
    // Calls arrive as a stream. A write waits for earlier reads and effects;
    // later reads wait for that write's complete gate and finalizer.
    const ready = isSequential ? Promise.all([sequential, ...active]) : sequential;
    const pending = ready.then(run);
    const settled = pending.then(() => undefined, () => undefined);
    active.add(settled);
    void settled.then(() => active.delete(settled));
    if (isSequential) sequential = settled;
    try { return await pending; }
    finally { owned.release(); }
  };
}

function nestedSignal(parent: AbortSignal | undefined, child: AbortSignal | undefined): {
  readonly signal: AbortSignal | undefined; readonly release: () => void;
} {
  if (!parent || !child || parent === child) return { signal: child ?? parent, release: () => {} };
  const controller = new AbortController();
  const cancel = () => controller.abort(parent.aborted ? parent.reason : child.reason);
  parent.addEventListener('abort', cancel, { once: true });
  child.addEventListener('abort', cancel, { once: true });
  if (parent.aborted || child.aborted) cancel();
  return { signal: controller.signal, release: () => {
    parent.removeEventListener('abort', cancel); child.removeEventListener('abort', cancel);
  } };
}

async function executeNested(host: GatedToolExecutorHost, target: ToolDefinition, rawArgs: Record<string, unknown>,
  callId: string, signal: AbortSignal | undefined): Promise<ToolExecutionResult> {
  const assistantMessage = { role: 'assistant' as const, content: '' };
  let args = rawArgs;
  let executed = false;
  let result: AgentToolResult;
  try {
    signal?.throwIfAborted();
    args = await host.prepare(target, rawArgs, signal);
    signal?.throwIfAborted();
    const call = { id: callId, name: target.name, args };
    const verdict = await host.hooks.beforeToolCall?.({ assistantMessage, call, args }, signal);
    signal?.throwIfAborted();
    if (verdict?.block) {
      result = { isError: true, output: verdict.reason || `Tool '${target.name}' was blocked.`,
        ...(verdict.terminate === true ? { terminate: true } : {}) };
    } else {
      result = await host.execute(target, callId, args, signal);
      executed = true;
      result = await finalizeExecutedCall(assistantMessage, call, args, result, host.hooks, signal);
    }
  } catch (error) {
    result = { isError: true, output: signal?.aborted ? 'Operation aborted'
      : error instanceof Error ? error.message : 'Nested tool execution failed.' };
  }
  for (const capturedArgs of args === rawArgs ? [args] : [args, rawArgs]) {
    try { host.cleanup?.(target, capturedArgs, signal); }
    catch { result = refusedResult(result, 'Nested call cleanup outcome is unverified.'); }
  }
  if (executed) {
    let refusal: string | undefined;
    try { refusal = target.resultAdmission?.(); }
    catch { refusal = 'Original result authority could not be verified.'; }
    if (refusal) result = refusedResult(result, refusal);
    if (signal?.aborted) result = refusedResult(result, 'Operation aborted before nested result publication.');
  }
  return {
    ...(result.isError ? { success: false, error: result.output } : { success: true, output: result.output }),
    metadata: result.metadata,
    ...(result.images ? { images: result.images } : {}),
    ...(result.terminate !== undefined ? { terminate: result.terminate } : {}),
  };
}

function refusedResult(result: AgentToolResult, reason: string): AgentToolResult {
  const warning = `${reason} Actual effect evidence remains visible.`;
  if (result.output.includes(warning)) return { ...result, isError: true };
  return { ...result, isError: true, output: `${result.output}\n${warning}`,
    ...(typeof result.metadata?.outputNotice === 'string'
      ? { metadata: { ...result.metadata, outputNotice: result.metadata.outputNotice + '\n' + warning } } : {}) };
}
