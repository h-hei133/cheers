import type { CurrentSessionSelectionRecord, CurrentSessionSelectionStore } from './currentSelection.js';
import { normalizePathIdentity } from '../continuation/roots.js';
import { snapshotData } from '../../core/values/data.js';

export interface SessionActivationGuard {
  readonly source: { readonly projectRoot: string; readonly expected: CurrentSessionSelectionRecord | undefined };
  /** Explicit undefined means a captured absence, never an omitted comparison. */
  readonly destination: CurrentSessionSelectionRecord | undefined;
  readonly signal?: AbortSignal;
  readonly admission?: () => string | undefined;
}

export interface SessionActivationOptions {
  readonly guard?: SessionActivationGuard;
  /** Captures a prepared identity; a callback is not evidence of publication. */
  readonly captureSelection?: (candidate: CurrentSessionSelectionRecord) => void;
  /** Resume holds the session lock before publishing its metadata under the registry lock. */
  readonly publishMetadata?: () => void;
}

function record(value: unknown): CurrentSessionSelectionRecord | undefined {
  if (value === undefined) return undefined;
  const captured = snapshotData(value, { bytes: 4096, nodes: 64, depth: 3 });
  if (captured === null || typeof captured !== 'object' || Array.isArray(captured)) throw new Error('Current session activation is unavailable.');
  const fields = captured as Readonly<Record<string, unknown>>;
  if (typeof fields.sessionId !== 'string' || !fields.sessionId.trim() || typeof fields.updatedAt !== 'string'
    || (fields.activationId !== undefined && (typeof fields.activationId !== 'string' || !fields.activationId.trim()))) {
    throw new Error('Current session activation is unavailable.');
  }
  return Object.freeze({ sessionId: fields.sessionId, updatedAt: fields.updatedAt,
    ...(typeof fields.activationId === 'string' ? { activationId: fields.activationId } : {}) });
}

/** Capture the caller's compared records before callbacks or lock acquisition. */
export function captureActivationGuard(guard: SessionActivationGuard | undefined): SessionActivationGuard | undefined {
  if (!guard) return undefined;
  const captured = { ...guard }, source = { ...captured.source };
  const root = normalizePathIdentity(source.projectRoot);
  if (!root || !Object.hasOwn(source, 'expected') || !Object.hasOwn(captured, 'destination')) throw new Error('Current session activation guard is unavailable.');
  return Object.freeze({ source: Object.freeze({ projectRoot: root, expected: record(source.expected) }),
    destination: record(captured.destination), signal: captured.signal, admission: captured.admission });
}

function selection(store: CurrentSessionSelectionStore, root: string): CurrentSessionSelectionRecord | undefined {
  const key = Object.hasOwn(store.byProjectRoot, root) ? root : root.toLowerCase();
  return record(Object.hasOwn(store.byProjectRoot, key) ? store.byProjectRoot[key] : undefined);
}

export function sameSessionActivation(left: CurrentSessionSelectionRecord | undefined, right: CurrentSessionSelectionRecord | undefined): boolean {
  return left === right || !!(left && right && left.sessionId === right.sessionId
    && left.updatedAt === right.updatedAt && left.activationId === right.activationId);
}

/** Final comparison runs against the fresh locked registry, immediately before publication. */
export function assertActivationGuard(guard: SessionActivationGuard | undefined, read: () => { readonly store: CurrentSessionSelectionStore; readonly readError: string | null }, destinationRoot: string): void {
  if (!guard) return;
  if (guard.signal) AbortSignal.prototype.throwIfAborted.call(guard.signal);
  const refused = guard.admission?.();
  if (guard.signal) AbortSignal.prototype.throwIfAborted.call(guard.signal);
  if (refused) throw new Error(refused);
  read();
  const rechecked = guard.admission?.();
  if (guard.signal) AbortSignal.prototype.throwIfAborted.call(guard.signal);
  if (rechecked) throw new Error(rechecked);
  const { store, readError } = read();
  if (readError) throw new Error('Current session activation is unavailable.');
  if (!sameSessionActivation(selection(store, guard.source.projectRoot), guard.source.expected)
    || !sameSessionActivation(selection(store, destinationRoot), guard.destination)) throw new Error('Current session activation changed while preparing the switch.');
  if (guard.signal) AbortSignal.prototype.throwIfAborted.call(guard.signal);
}
