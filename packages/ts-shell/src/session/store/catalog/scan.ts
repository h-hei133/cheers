import type { SessionStoreLayout } from '../sessionFileLayout.js';
import { discoverSessions } from './discovery.js';
import { CATALOG_LIMITS, type SessionSummary } from './model.js';

export interface CatalogBatch {
  readonly summaries: readonly SessionSummary[];
  readonly unreadable: number;
  readonly directory: string;
}

/** Every caller shares bounded dispatch, cursor closure and dispatched-read settlement. */
export async function* scanCatalog(layout: SessionStoreLayout, currentId: string,
  read: (id: string, directory: string) => Promise<SessionSummary | undefined>,
  signal?: AbortSignal, onSource?: (target: string) => void): AsyncGenerator<CatalogBatch> {
  for await (const page of discoverSessions(layout, signal, onSource)) {
    const ids = page.ids.filter(id => id !== currentId);
    const summaries: SessionSummary[] = [];
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < ids.length) {
        signal?.throwIfAborted();
        const summary = await read(ids[next++]!, page.directory);
        if (summary) summaries.push(summary);
      }
    };
    const settled = await Promise.allSettled(Array.from({ length: Math.min(CATALOG_LIMITS.concurrency, ids.length) }, worker));
    signal?.throwIfAborted();
    const failure = settled.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    yield { summaries, unreadable: page.unreadable, directory: page.directory };
  }
}
