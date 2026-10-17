import path from 'node:path';
import { assertProfileStorage, currentProfile, type ProfileContext } from '../../core/paths/profile/context.js';
import type { ProjectMemoryStoreRef } from '../projectMemoryStoreContract.js';

const owners = new WeakMap<ProjectMemoryStoreRef, ProfileContext>();

/** Storage identity stays private; serializable memory references keep their existing contract. */
export function captureMemoryOwner(ref: ProjectMemoryStoreRef, owner = currentProfile()): ProjectMemoryStoreRef {
  if (owner) owners.set(ref, owner);
  assertMemoryOwner(ref);
  return ref;
}

export function assertMemoryOwner(ref: ProjectMemoryStoreRef): void {
  const owner = owners.get(ref);
  if (!owner || !ref.root) return;
  assertProfileStorage(ref.root, owner);
  assertProfileStorage(ref.recordsFile ?? path.join(ref.root, 'project-memory.jsonl'), owner);
}

export function inheritMemoryOwner(ref: ProjectMemoryStoreRef, next: ProjectMemoryStoreRef): ProjectMemoryStoreRef {
  const owner = owners.get(ref);
  return owner ? captureMemoryOwner(next, owner) : next;
}
