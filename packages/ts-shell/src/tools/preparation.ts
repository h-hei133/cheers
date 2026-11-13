import type { PreparedWriteCandidate, ToolDefinition, ToolExecutionContext, ToolPreparation } from './types.js';

interface PreparedCall {
  readonly tool: ToolDefinition;
  readonly owner: object;
  readonly preparation: ToolPreparation;
  readonly writeCandidate?: PreparedWriteCandidate;
  readonly writeCandidates?: readonly PreparedWriteCandidate[];
  readonly snapshot?: unknown;
  hookCallId?: string;
  callId?: string;
  selection?: readonly string[];
  selectionRevision?: string;
}

const calls = new WeakMap<object, PreparedCall>();

function cloneSnapshotValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (let i = 0; i < value.length; i++) {
      copy.push(cloneSnapshotValue(value[i], seen));
    }
    return copy;
  }
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: cloneSnapshotValue((value as Record<string, unknown>)[key], seen),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return copy;
}

function deepSnapshotEqual(a: unknown, b: unknown, seen = new WeakMap<object, WeakSet<object>>()): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags;
  }
  let paired = seen.get(a);
  if (paired?.has(b)) return true;
  if (!paired) {
    paired = new WeakSet<object>();
    seen.set(a, paired);
  }
  paired.add(b);
  const aIsArr = Array.isArray(a);
  if (aIsArr !== Array.isArray(b)) return false;
  if (aIsArr) {
    const arrA = a as readonly unknown[];
    const arrB = b as readonly unknown[];
    if (arrA.length !== arrB.length) return false;
    for (let i = 0; i < arrA.length; i++) {
      if (!deepSnapshotEqual(arrA[i], arrB[i], seen)) return false;
    }
    return true;
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
    if (!deepSnapshotEqual(objA[key], objB[key], seen)) return false;
  }
  return true;
}

export function prepareToolCall(tool: ToolDefinition, args: Record<string, unknown>, context: ToolExecutionContext, owner: object,
  verify?: () => void): Record<string, unknown> | Promise<Record<string, unknown>> {
  const prepared = Object.freeze({ ...args });
  const initialSnapshot = tool.name === 'edit' || tool.name === 'apply_patch' ? cloneSnapshotValue(prepared) : undefined;
  const publish = (resolved: ToolPreparation, asyncResolved: boolean): Record<string, unknown> => {
    context.abortSignal?.throwIfAborted();
    verify?.();
    const hasCandidate = Boolean(resolved.writeCandidate || resolved.writeCandidates?.length);
    if (asyncResolved && hasCandidate && initialSnapshot !== undefined && !deepSnapshotEqual(initialSnapshot, prepared)) {
      throw new Error('Prepared edit arguments changed during capture.');
    }
    const snapshot = hasCandidate ? (initialSnapshot ?? cloneSnapshotValue(prepared)) : undefined;
    const writeCandidate = resolved.writeCandidate
      ? Object.freeze({ ...resolved.writeCandidate, before: Object.freeze({ ...resolved.writeCandidate.before }) }) : undefined;
    const writeCandidates = resolved.writeCandidates?.length
      ? Object.freeze(resolved.writeCandidates.map(candidate => Object.freeze({
          ...candidate,
          before: Object.freeze({ ...candidate.before }),
        })))
      : undefined;
    calls.set(prepared, {
      tool,
      owner,
      preparation: resolved,
      ...(writeCandidate ? { writeCandidate } : {}),
      ...(writeCandidates ? { writeCandidates } : {}),
      ...(snapshot !== undefined ? { snapshot } : {}),
    });
    return prepared;
  };
  const preparation = tool.prepare!(prepared, context);
  return preparation instanceof Promise ? preparation.then(resolved => publish(resolved, true)) : publish(preparation, false);
}

export function preparedToolCall(args: object, owner: object): ToolPreparation | undefined {
  const call = calls.get(args);
  if (call && call.owner !== owner) throw new Error('Prepared tool call belongs to another runtime.');
  return call?.preparation;
}

/** Bind the original prepared argument identity after ordinary permission, before hooks. */
export function bindPreparedToolCall(args: object, owner: object, toolName: string, callId: string): void {
  const call = calls.get(args);
  if (!call?.writeCandidate && !call?.writeCandidates?.length) return;
  if (!callId || call.owner !== owner || call.tool.name !== toolName || call.hookCallId || call.callId) throw new Error('Prepared tool call hook identity does not match.');
  call.hookCallId = callId;
}

/** Only the live host-bound call can expose its candidate; raw model fields are ignored. */
export function preparedWriteCandidate(args: object, toolName: string, callId: string): PreparedWriteCandidate | undefined {
  const call = calls.get(args);
  if (!call?.writeCandidate || call.tool.name !== toolName || call.hookCallId !== callId) return undefined;
  if (call.snapshot !== undefined && !deepSnapshotEqual(call.snapshot, args)) throw new Error('Prepared edit arguments changed after capture.');
  return call.writeCandidate;
}

/** Expose all host-bound file write candidates for multi-file patch inspection. */
export function preparedWriteCandidates(args: object, toolName: string, callId: string): readonly PreparedWriteCandidate[] | undefined {
  const call = calls.get(args);
  if ((!call?.writeCandidates?.length && !call?.writeCandidate) || call.tool.name !== toolName || call.hookCallId !== callId) return undefined;
  if (call.snapshot !== undefined && !deepSnapshotEqual(call.snapshot, args)) throw new Error('Prepared edit arguments changed after capture.');
  return call.writeCandidates ?? (call.writeCandidate ? [call.writeCandidate] : undefined);
}

export function authorizeToolCall(args: object, owner: object, toolName: string, callId: string): void {
  const call = calls.get(args);
  if (!call) return;
  if (call.owner !== owner || call.tool.name !== toolName || call.callId) throw new Error('Prepared tool call approval does not match.');
  if ((call.writeCandidate || call.writeCandidates?.length) && (call.hookCallId !== callId || (call.snapshot !== undefined && !deepSnapshotEqual(call.snapshot, args)))) throw new Error('Prepared edit approval changed after capture.');
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
  if ((call.writeCandidate || call.writeCandidates?.length) && call.snapshot !== undefined && !deepSnapshotEqual(call.snapshot, args)) throw new Error('Prepared edit arguments changed after capture.');
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
