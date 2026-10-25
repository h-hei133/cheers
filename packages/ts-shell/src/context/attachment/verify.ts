import { assertContextBounds, contextEntryPathWithinRoot, contextEntryStillAuthorized, type ContextEntry } from './entry.js';
import type { FileState } from '../../core/workspace/files.js';

/** Validate the actual UTF-8 snapshot serially, preserving attachment scope and digest. */
export async function verifyContextEntries(root: string, entries: readonly ContextEntry[],
  read: (target: string, maxBytes: number) => Promise<FileState>, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted(); assertContextBounds(entries);
  for (const entry of entries) {
    signal.throwIfAborted();
    if (!contextEntryPathWithinRoot(root, entry)) throw new Error('Extra context changed or is no longer authorized.');
    const file = await read(entry.path, entry.bounds.maxBytes);
    signal.throwIfAborted();
    if (!contextEntryStillAuthorized(root, entry, () => file)) throw new Error('Extra context changed or is no longer authorized.');
  }
  signal.throwIfAborted();
}
