import type { PreparedWriteCandidate, ToolDefinition, ToolExecutionContext, ToolPreparation } from './types.js';

interface PreparedCall {
  readonly tool: ToolDefinition;
  readonly owner: object;
  readonly preparation: ToolPreparation;
  readonly writeCandidate?: PreparedWriteCandidate;
  readonly source?: string;
  hookCallId?: string;
  callId?: string;
  selection?: readonly string[];
  selectionRevision?: string;
}

const calls = new WeakMap<object, PreparedCall>();

export function prepareToolCall(tool: ToolDefinition, args: Record<string, unknown>, context: ToolExecutionContext, owner: object,
  verify?: () => void): Record<string, unknown> | Promise<Record<string, unknown>> {
  const prepared = Object.freeze({ ...args });
  const source = tool.name === 'edit' ? JSON.stringify(prepared) : undefined;
  const publish = (preparation: ToolPreparation): Record<string, unknown> => {
    context.abortSignal?.throwIfAborted();
    verify?.();
    if (preparation.writeCandidate && source !== undefined && source !== JSON.stringify(prepared)) throw new Error('Prepared edit arguments changed during capture.');
    const writeCandidate = preparation.writeCandidate
      ? Object.freeze({ ...preparation.writeCandidate, before: Object.freeze({ ...preparation.writeCandidate.before }) }) : undefined;
    calls.set(prepared, { tool, owner, preparation, ...(writeCandidate ? { writeCandidate, source: source ?? JSON.stringify(prepared) } : {}) });
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

/** Bind the original prepared argument identity after ordinary permission, before hooks. */
export function bindPreparedToolCall(args: object, owner: object, toolName: string, callId: string): void {
  const call = calls.get(args);
  if (!call?.writeCandidate) return;
  if (!callId || call.owner !== owner || call.tool.name !== toolName || call.hookCallId || call.callId) throw new Error('Prepared tool call hook identity does not match.');
  call.hookCallId = callId;
}

/** Only the live host-bound call can expose its candidate; raw model fields are ignored. */
export function preparedWriteCandidate(args: object, toolName: string, callId: string): PreparedWriteCandidate | undefined {
  const call = calls.get(args);
  if (!call?.writeCandidate || call.tool.name !== toolName || call.hookCallId !== callId) return undefined;
  if (call.source !== JSON.stringify(args)) throw new Error('Prepared edit arguments changed after capture.');
  return call.writeCandidate;
}

export function authorizeToolCall(args: object, owner: object, toolName: string, callId: string): void {
  const call = calls.get(args);
  if (!call) return;
  if (call.owner !== owner || call.tool.name !== toolName || call.callId) throw new Error('Prepared tool call approval does not match.');
  if (call.writeCandidate && (call.hookCallId !== callId || call.source !== JSON.stringify(args))) throw new Error('Prepared edit approval changed after capture.');
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
  if (call.writeCandidate && call.source !== JSON.stringify(args)) throw new Error('Prepared edit arguments changed after capture.');
  return call.preparation;
}

/** Record the approval host's group selection for this exact prepared call. */
export function setPreparedSelection(
  args: object,
  selection: readonly string[],
  revision?: string,
): void {
  const call = calls.get(args);
  if (call) {
    call.selection = Object.freeze([...selection]);
    if (revision !== undefined) call.selectionRevision = revision;
  }
}

export function preparedSelection(args: object): readonly string[] | undefined { return calls.get(args)?.selection; }
export function preparedSelectionRevision(args: object): string | undefined {
  return calls.get(args)?.selectionRevision;
}

export function discardToolCall(args: object): void { calls.delete(args); }
