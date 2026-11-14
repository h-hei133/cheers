import type { PreparedWriteCandidate, PreparedWriteInspection, ToolDefinition, ToolExecutionContext, ToolPreparation } from './types.js';

interface PreparedCall {
  readonly tool: ToolDefinition;
  readonly owner: object;
  readonly preparation: ToolPreparation;
  readonly writeCandidate?: PreparedWriteCandidate;
  readonly writeCandidates?: readonly PreparedWriteCandidate[];
  readonly selectionInspection?: ToolPreparation['selectionInspection'];
  readonly selectionIds?: ReadonlySet<string>;
  readonly snapshot?: unknown;
  writeInspection?: PreparedWriteInspection;
  hookCallId?: string;
  callId?: string;
  selection?: readonly string[];
  selectionRevision?: string;
}

const calls = new WeakMap<object, PreparedCall>();

function captureInspection(value: PreparedWriteInspection): PreparedWriteInspection {
  return Object.freeze({
    targets: Object.freeze(value.targets.map(target => Object.freeze({ ...target }))),
    writeCandidates: Object.freeze(value.writeCandidates.map(candidate => Object.freeze({
      ...candidate, before: Object.freeze({ ...candidate.before }),
    }))),
    ...(value.revision === undefined ? {} : { revision: value.revision }),
  });
}

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
    const protectedCall = Boolean(resolved.writeCandidate || resolved.writeCandidates?.length
      || resolved.selectionInspection || tool.name === 'apply_patch');
    if (asyncResolved && protectedCall && initialSnapshot !== undefined && !deepSnapshotEqual(initialSnapshot, prepared)) {
      throw new Error('Prepared edit arguments changed during capture.');
    }
    const snapshot = protectedCall ? (initialSnapshot ?? cloneSnapshotValue(prepared)) : undefined;
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
      ...(tool.name === 'apply_patch' || resolved.selectionInspection ? {
        writeInspection: captureInspection({ targets: resolved.targets,
          writeCandidates: writeCandidates ?? (writeCandidate ? [writeCandidate] : []), revision: resolved.selectionRevision }),
      } : {}),
      ...(resolved.selectionInspection ? { selectionInspection: resolved.selectionInspection } : {}),
      ...(resolved.selections ? { selectionIds: new Set(resolved.selections.map(group => group.id)) } : {}),
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
  if (!call || call.snapshot === undefined) return;
  if (!callId || call.owner !== owner || call.tool.name !== toolName || call.hookCallId || call.callId) throw new Error('Prepared tool call hook identity does not match.');
  if (!deepSnapshotEqual(call.snapshot, args)) throw new Error('Prepared edit arguments changed after capture.');
  if (call.selectionInspection) {
    if (!call.selection?.length || !call.selectionRevision) throw new Error('The approved patch selection is missing its exact preview revision. Nothing was written.');
    let inspection: PreparedWriteInspection;
    try { inspection = captureInspection(call.selectionInspection(call.selection)); }
    catch (error) {
      throw new Error(`Patch changed after approval or its selection is stale. Nothing was written. ${error instanceof Error ? error.message : ''}`.trim());
    }
    if (inspection.revision !== call.selectionRevision) throw new Error('Patch selection revision changed after approval. Nothing was written.');
    if (!deepSnapshotEqual(call.snapshot, args)) throw new Error('Prepared edit arguments changed after capture.');
    call.writeInspection = inspection;
  }
  call.hookCallId = callId;
}

/** Only the live host-bound call can expose its candidate; raw model fields are ignored. */
export function preparedWriteCandidate(args: object, toolName: string, callId: string): PreparedWriteCandidate | undefined {
  const call = calls.get(args);
  if (call?.writeInspection) {
    const inspection = preparedWriteInspection(args, toolName, callId);
    return inspection?.targets.length === 1 && inspection.writeCandidates.length === 1 ? inspection.writeCandidates[0] : undefined;
  }
  if (!call?.writeCandidate || call.tool.name !== toolName || call.hookCallId !== callId) return undefined;
  if (call.snapshot !== undefined && !deepSnapshotEqual(call.snapshot, args)) throw new Error('Prepared edit arguments changed after capture.');
  return call.writeCandidate;
}

/** Expose all host-bound file write candidates for multi-file patch inspection. */
export function preparedWriteCandidates(args: object, toolName: string, callId: string): readonly PreparedWriteCandidate[] | undefined {
  const call = calls.get(args);
  if (call?.writeInspection) return preparedWriteInspection(args, toolName, callId)?.writeCandidates;
  if ((!call?.writeCandidates?.length && !call?.writeCandidate) || call.tool.name !== toolName || call.hookCallId !== callId) return undefined;
  if (call.snapshot !== undefined && !deepSnapshotEqual(call.snapshot, args)) throw new Error('Prepared edit arguments changed after capture.');
  return call.writeCandidates ?? (call.writeCandidate ? [call.writeCandidate] : undefined);
}

/** The selected exhaustive effects belong only to the original host-bound call. */
export function preparedWriteInspection(args: object, toolName: string, callId: string): PreparedWriteInspection | undefined {
  const call = calls.get(args);
  if (!call?.writeInspection || call.tool.name !== toolName || call.hookCallId !== callId) return undefined;
  if (call.snapshot !== undefined && !deepSnapshotEqual(call.snapshot, args)) throw new Error('Prepared edit arguments changed after capture.');
  return call.writeInspection;
}

export function authorizeToolCall(args: object, owner: object, toolName: string, callId: string): void {
  const call = calls.get(args);
  if (!call) return;
  if (call.owner !== owner || call.tool.name !== toolName || call.callId) throw new Error('Prepared tool call approval does not match.');
  if (call.snapshot !== undefined && (call.hookCallId !== callId || !deepSnapshotEqual(call.snapshot, args))) throw new Error('Prepared edit approval changed after capture.');
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
  if (call.snapshot !== undefined && !deepSnapshotEqual(call.snapshot, args)) throw new Error('Prepared edit arguments changed after capture.');
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
    if (call.selection || call.hookCallId || call.callId) throw new Error('The approved tool selection cannot be replaced.');
    if (!Array.isArray(selection) || selection.length === 0 || new Set(selection).size !== selection.length
      || selection.some(id => typeof id !== 'string' || !id.trim() || !call.selectionIds?.has(id))) {
      throw new Error('The approved tool selection contains unknown or duplicate groups.');
    }
    if (call.selectionInspection && (typeof revision !== 'string' || !revision.trim())) throw new Error('The approved patch selection is missing its exact preview revision.');
    call.selection = Object.freeze([...selection]);
    if (revision !== undefined) call.selectionRevision = revision;
  }
}

export function preparedSelection(args: object): readonly string[] | undefined { return calls.get(args)?.selection; }
export function preparedSelectionRevision(args: object): string | undefined {
  return calls.get(args)?.selectionRevision;
}

export function discardToolCall(args: object): void { calls.delete(args); }
