import type { ToolDefinition, ToolExecutionContext, ToolPreparation } from './types.js';

interface PreparedCall {
  readonly tool: ToolDefinition;
  readonly owner: object;
  readonly preparation: ToolPreparation;
  callId?: string;
  selection?: readonly string[];
}

const calls = new WeakMap<object, PreparedCall>();

export function prepareToolCall(tool: ToolDefinition, args: Record<string, unknown>, context: ToolExecutionContext, owner: object,
  verify?: () => void): Record<string, unknown> | Promise<Record<string, unknown>> {
  const prepared = Object.freeze({ ...args });
  const publish = (preparation: ToolPreparation): Record<string, unknown> => {
    context.abortSignal?.throwIfAborted();
    verify?.();
    calls.set(prepared, { tool, owner, preparation });
    return prepared;
  };
  const preparation = tool.prepare!(prepared, context);
  return preparation instanceof Promise ? preparation.then(publish) : publish(preparation);
}

export function preparedToolCall(args: object, owner: object): ToolPreparation | undefined {
  const call = calls.get(args);
  if (call && call.owner !== owner) throw new Error('Prepared tool call belongs to another runtime.');
  return call?.preparation;
}

export function authorizeToolCall(args: object, owner: object, toolName: string, callId: string): void {
  const call = calls.get(args);
  if (!call) return;
  if (call.owner !== owner || call.tool.name !== toolName || call.callId) throw new Error('Prepared tool call approval does not match.');
  call.callId = callId;
}

export function consumeToolCall(args: object, owner: object, tool: ToolDefinition, callId: string): ToolPreparation | undefined {
  const call = calls.get(args);
  calls.delete(args);
  if (!call) {
    if (tool.prepare) throw new Error('A prepared and approved tool call is required.');
    return undefined;
  }
  if (call.owner !== owner || call.tool !== tool || call.callId !== callId) throw new Error('Prepared tool call was not approved for this execution.');
  return call.preparation;
}

/** Record the approval host's group selection for this exact prepared call. */
export function setPreparedSelection(args: object, selection: readonly string[]): void {
  const call = calls.get(args);
  if (call) call.selection = Object.freeze([...selection]);
}

export function preparedSelection(args: object): readonly string[] | undefined { return calls.get(args)?.selection; }

export function discardToolCall(args: object): void { calls.delete(args); }
