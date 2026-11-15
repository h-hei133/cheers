import { types } from 'node:util';
import type { TranscriptEvent } from '../../sessionEventCodec.js';
import { BranchStoreError, CODEMODE_STORE_NAMESPACE, isBranchStoreNamespace, MAX_STORE_REVISION_KEYS, MAX_STORE_REVISION_KEY_CHARS,
  MAX_STORE_TOTAL_CHARS, MAX_STORE_VALUE_CHARS,
  type BranchStoreWrites } from './contract.js';

export interface BranchStoreReplay {
  readonly values: ReadonlyMap<string, string>;
  /** Deleted keys retain their last revision, including deletion of an absent key. */
  readonly revisions: ReadonlyMap<string, number>;
}

/** Preserve the serialized string ABI without invoking accessors or serialization hooks. */
export function captureStoreWrites(writes: BranchStoreWrites, bounded = false): BranchStoreWrites {
  if (!writes || typeof writes !== 'object' || Array.isArray(writes) || types.isProxy(writes)) throw new BranchStoreError('invalid');
  const captured: Record<string, string | null> = Object.create(null);
  const keys = Reflect.ownKeys(writes); let chars = 0; let valueChars = 0;
  if (bounded && keys.length > MAX_STORE_REVISION_KEYS) throw new BranchStoreError('budget');
  for (const key of keys) {
    if (typeof key !== 'string' || !key) throw new BranchStoreError('invalid');
    chars += key.length;
    if (bounded && chars > MAX_STORE_REVISION_KEY_CHARS) throw new BranchStoreError('budget');
    const descriptor = Object.getOwnPropertyDescriptor(writes, key);
    if (!descriptor || !('value' in descriptor)) throw new BranchStoreError('invalid');
    const value: unknown = descriptor.value;
    if (value !== null && (typeof value !== 'string' || value.length > MAX_STORE_VALUE_CHARS)) throw new BranchStoreError('invalid');
    if (bounded && typeof value === 'string') {
      valueChars += key.length + value.length;
      if (valueChars > MAX_STORE_TOTAL_CHARS) throw new BranchStoreError('budget');
    }
    if (value !== null) { try { JSON.parse(value as string); } catch { throw new BranchStoreError('invalid'); } }
    captured[key] = value as string | null;
  }
  if (bounded) assertStoreBudget(new Map(), captured);
  return Object.freeze(captured);
}

export function assertStoreBudget(base: ReadonlyMap<string, string>, writes: BranchStoreWrites): void {
  let total = 0;
  for (const [key, value] of base) if (!Object.hasOwn(writes, key)) total += key.length + value.length;
  for (const [key, value] of Object.entries(writes)) if (value !== null) total += key.length + value.length;
  if (total > MAX_STORE_TOTAL_CHARS) throw new BranchStoreError('budget');
}

/** Legacy unbound codemode entries apply to descendants; internal entries always name an anchor. */
export function replayBranchStore(events: readonly TranscriptEvent[], namespace: string, activeEntryIds?: readonly string[]): BranchStoreReplay {
  if (namespace !== CODEMODE_STORE_NAMESPACE && !isBranchStoreNamespace(namespace)) throw new BranchStoreError('invalid');
  const onBranch = activeEntryIds ? new Set(activeEntryIds) : undefined;
  const values = new Map<string, string>(); const revisions = new Map<string, number>(); let revisionChars = 0;
  for (const event of events) {
    const selected = namespace === CODEMODE_STORE_NAMESPACE ? event.type === 'codemode-store'
      : event.type === 'branch-store' && event.namespace === namespace;
    if (!selected || (event.type !== 'codemode-store' && event.type !== 'branch-store')) continue;
    if (event.type === 'branch-store' && (!event.id || typeof event.sourceEntryId !== 'string' || !event.sourceEntryId)) {
      throw new BranchStoreError('invalid');
    }
    if (onBranch && event.sourceEntryId && !onBranch.has(event.sourceEntryId)) continue;
    const entries = captureStoreWrites(event.entries, namespace !== CODEMODE_STORE_NAMESPACE);
    for (const [key, value] of Object.entries(entries)) {
      if (!revisions.has(key)) {
        revisionChars += key.length;
        if (namespace !== CODEMODE_STORE_NAMESPACE && (revisions.size >= MAX_STORE_REVISION_KEYS
          || revisionChars > MAX_STORE_REVISION_KEY_CHARS)) throw new BranchStoreError('budget');
      }
      const revision = (revisions.get(key) ?? 0) + 1;
      if (!Number.isSafeInteger(revision)) throw new BranchStoreError('budget');
      revisions.set(key, revision);
      if (value === null) values.delete(key);
      else values.set(key, value);
    }
  }
  assertStoreBudget(values, {});
  return { values, revisions };
}

export function assertStoreRevisions(current: BranchStoreReplay, captured: BranchStoreReplay, keys?: readonly string[]): void {
  const compared = keys ?? [...new Set([...current.revisions.keys(), ...captured.revisions.keys()])];
  if (compared.some(key => (current.revisions.get(key) ?? 0) !== (captured.revisions.get(key) ?? 0))) throw new BranchStoreError('conflict');
}

export function captureStoreKeys(keys: readonly string[] | undefined): readonly string[] | undefined {
  if (keys === undefined) return undefined;
  if (!Array.isArray(keys) || types.isProxy(keys)) throw new BranchStoreError('invalid');
  if (keys.length > MAX_STORE_REVISION_KEYS) throw new BranchStoreError('budget');
  if (Reflect.ownKeys(keys).length !== keys.length + 1) throw new BranchStoreError('invalid');
  const captured: string[] = []; let chars = 0;
  for (let index = 0; index < keys.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(keys, index);
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string' || !descriptor.value) throw new BranchStoreError('invalid');
    chars += descriptor.value.length;
    if (chars > MAX_STORE_REVISION_KEY_CHARS) throw new BranchStoreError('budget');
    captured.push(descriptor.value);
  }
  return Object.freeze(captured);
}

/** Tombstones are durable revision facts and count even when no live value remains. */
export function assertRevisionBudget(revisions: ReadonlyMap<string, number>, writes: BranchStoreWrites): void {
  const keys = new Set([...revisions.keys(), ...Object.keys(writes)]);
  if (keys.size > MAX_STORE_REVISION_KEYS) throw new BranchStoreError('budget');
  let chars = 0;
  for (const key of keys) {
    chars += key.length;
    if (chars > MAX_STORE_REVISION_KEY_CHARS) throw new BranchStoreError('budget');
  }
}
