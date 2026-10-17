import fs from "node:fs";
import path from "node:path";
import { withFileLock } from "../../session/store/sessionFileStore.js";
import { recordsFileFor } from "../memoryPersistence.js";
import type { ProjectMemoryStoreRef } from "../projectMemoryStoreContract.js";
import { assertMemoryOwner, inheritMemoryOwner } from './owner.js';

/** All cooperating writers read and mutate the same physical store under one lock. */
export function withMemoryStoreLock<T>(
  ref: ProjectMemoryStoreRef,
  action: (lockedRef: ProjectMemoryStoreRef) => T,
): T {
  assertMemoryOwner(ref);
  const file = recordsFileFor(ref);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  assertMemoryOwner(ref);
  const recordsFile = canonicalFile(file);
  return withFileLock(`${recordsFile}.lock`, () => {
    assertMemoryOwner(ref);
    return action(inheritMemoryOwner(ref, { ...ref, recordsFile }));
  });
}

function canonicalFile(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // A dangling link must not be replaced by an ordinary file. Refuse it until
    // its target can be resolved; new ordinary files use the physical parent.
    if (fs.lstatSync(file, { throwIfNoEntry: false })) throw error;
    return path.join(fs.realpathSync(path.dirname(file)), path.basename(file));
  }
}
