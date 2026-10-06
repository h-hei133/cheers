import { isRecord } from '../core/values/record.js';
import { normalizeConnectionId, sameArraySlots, sameValue } from './values.js';
import { ConfigWriteError } from './outcome.js';

/** Credentials and whole connection records must never mix generations. */
function atomic(path: readonly string[]): boolean {
  return path.length === 2 && (path[0] === 'providerCredentials' || path[0] === 'providerConnections');
}

function merge(before: unknown, desired: unknown, current: unknown, path: readonly string[]): unknown {
  if (sameValue(before, desired)) return current;
  if (sameValue(before, current)) return desired;
  if (sameValue(desired, current)) return current;
  if (!atomic(path) && isRecord(before) && isRecord(desired) && isRecord(current)) {
    const result = { ...current };
    for (const key of new Set([...Object.keys(before), ...Object.keys(desired)])) {
      const value = merge(before[key], desired[key], current[key], [...path, key]);
      if (value === undefined) delete result[key]; else result[key] = value;
    }
    return result;
  }
  // Membership or order changes conflict conservatively. Stable identities can
  // merge independent records; arbitrary positional arrays remain atomic.
  if (path.length === 1 && path[0] === 'providerConnections' && Array.isArray(before) && Array.isArray(desired) && Array.isArray(current)
    && sameArraySlots(before, desired) && sameArraySlots(before, current)) {
    return before.map((value, index) => merge(value, desired[index], current[index], [...path, String(index)]));
  }
  throw new ConfigWriteError('conflict', 'unchanged');
}

/** Validate the resulting selection, never silently clear another writer's ID. */
function checkSelection(value: Record<string, unknown>): void {
  const id = activeId(value);
  if (id === undefined) return;
  const selected = connection(value, id);
  if (!selected || (value.provider !== undefined && selected.provider !== value.provider)) throw new ConfigWriteError('conflict', 'unchanged');
}

function activeId(value: Record<string, unknown>): string | undefined {
  return normalizeConnectionId(value.activeProviderConnectionId as string | undefined);
}

function connection(value: Record<string, unknown>, id: string): Record<string, unknown> | undefined {
  return Array.isArray(value.providerConnections)
    ? value.providerConnections.find(item => isRecord(item) && normalizeConnectionId(item.id as string) === id) : undefined;
}

export function mergeConfigEdit(before: Record<string, unknown>, desired: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown> {
  const beforeId = activeId(before); const desiredId = activeId(desired); const currentId = activeId(current);
  // A model/credential edit based on the active connection cannot claim success
  // after another terminal changes which connection is active.
  if (beforeId === desiredId && beforeId !== currentId
    && (!sameValue(before.providerConnections, desired.providerConnections) || !sameValue(before.providerCredentials, desired.providerCredentials))) {
    throw new ConfigWriteError('conflict', 'unchanged');
  }
  // Selecting an existing identity depends on the record the caller inspected.
  // Do not silently switch to credentials replaced while that choice was pending.
  if (beforeId !== desiredId && desiredId !== undefined) {
    const previous = connection(before, desiredId); const latest = connection(current, desiredId);
    if (previous !== undefined && !sameValue(previous, latest) && !sameValue(connection(desired, desiredId), latest)) throw new ConfigWriteError('conflict', 'unchanged');
  }
  const result = merge(before, desired, current, []) as Record<string, unknown>;
  checkSelection(result);
  return result;
}
