import { opendir } from 'node:fs/promises';
import type { SessionStoreLayout } from '../sessionFileLayout.js';
import { CATALOG_LIMITS } from './model.js';

export interface SessionCandidates {
  readonly directory: string;
  readonly ids: readonly string[];
  readonly unreadable: number;
}

/** A live directory cursor, released when the consumer cancels or stops iterating. */
export async function* discoverSessions(store: SessionStoreLayout, signal?: AbortSignal, onSource?: (target: string) => void): AsyncGenerator<SessionCandidates> {
  for (const directory of store.sessionsSearchDirs) {
    signal?.throwIfAborted();
    onSource?.(directory);
    let cursor;
    try { cursor = await opendir(directory, { bufferSize: CATALOG_LIMITS.directoryEntries }); }
    catch (error) {
      signal?.throwIfAborted();
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') yield { directory, ids: [], unreadable: 1 };
      continue;
    }
    try {
      let ids: string[] = [];
      let examined = 0;
      for (;;) {
        signal?.throwIfAborted();
        const entry = await cursor.read();
        signal?.throwIfAborted();
        if (!entry) { if (ids.length) yield { directory, ids, unreadable: 0 }; break; }
        examined++;
        if (entry.isDirectory()) ids.push(entry.name);
        if (ids.length === CATALOG_LIMITS.summaries || examined === CATALOG_LIMITS.directoryEntries) {
          yield { directory, ids, unreadable: 0 };
          ids = []; examined = 0;
        }
      }
    } finally {
      await cursor.close();
    }
  }
}
