import { lstat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { assertSessionStoreProfile, projectSessionFileLayout, validateSessionId, type SessionFileLayout, type SessionStoreLayout } from './sessionFileLayout.js';

export interface SessionFileSize {
  readonly status: 'complete' | 'partial' | 'unknown';
  /** Sum of stable, readable core-file sizes; null when none could be established. */
  readonly bytes: number | null;
  readonly sampledAt: string;
}

const MAX_SIZE_SESSIONS = 41;
const SIZE_CONCURRENCY = 4;

/** Read-only sampling of the store's metadata, complete transcript and state files. */
export class SessionFiles {
  constructor(private readonly layout: SessionStoreLayout) {}

  async sizes(sessionIds: readonly string[], signal?: AbortSignal): Promise<ReadonlyMap<string, SessionFileSize>> {
    assertSessionStoreProfile(this.layout);
    signal?.throwIfAborted();
    if (sessionIds.length > MAX_SIZE_SESSIONS) throw new RangeError('Too many sessions in one file-size sample.');
    const ids = [...new Set(sessionIds)];
    for (const id of ids) {
      if (validateSessionId(id) !== id || id === '.' || id === '..') throw new Error('Invalid session identity.');
    }
    const sizes = new Map<string, SessionFileSize>();
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < ids.length) {
        signal?.throwIfAborted();
        const id = ids[next++]!;
        sizes.set(id, await sampleSize(this.layout, id, signal));
      }
    };
    const settled = await Promise.allSettled(Array.from({ length: Math.min(SIZE_CONCURRENCY, ids.length) }, worker));
    signal?.throwIfAborted();
    const failure = settled.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    return sizes;
  }
}

async function locate(layout: SessionStoreLayout, id: string, signal?: AbortSignal): Promise<SessionFileLayout | undefined> {
  for (const sessionsDir of layout.sessionsSearchDirs) {
    signal?.throwIfAborted();
    const candidate = projectSessionFileLayout({ sessionsDir, sessionId: id });
    for (const target of Object.values(candidate)) assertSessionStoreProfile(layout, target);
    try {
      const directory = await lstat(candidate.sessionDir);
      signal?.throwIfAborted();
      return directory.isDirectory() ? candidate : undefined;
    } catch (error) {
      signal?.throwIfAborted();
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return undefined;
    }
  }
  return undefined;
}

async function stat(target: string, signal?: AbortSignal): Promise<Stats | undefined> {
  signal?.throwIfAborted();
  try {
    const result = await lstat(target);
    signal?.throwIfAborted();
    return result;
  } catch {
    signal?.throwIfAborted();
    return undefined;
  }
}

function same(left: Stats | undefined, right: Stats | undefined): boolean {
  return !!left && !!right && left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

async function sampleSize(store: SessionStoreLayout, id: string, signal?: AbortSignal): Promise<SessionFileSize> {
  const layout = await locate(store, id, signal);
  const unknown = (): SessionFileSize => ({ status: 'unknown', bytes: null, sampledAt: new Date().toISOString() });
  if (!layout) return unknown();
  const directory = await stat(layout.sessionDir, signal);
  const paths = [layout.metadataPath, layout.transcriptPath, layout.statePath];
  const before: (Stats | undefined)[] = [];
  for (const target of paths) before.push(await stat(target, signal));
  let bytes = 0;
  let known = 0;
  for (let index = 0; index < paths.length; index++) {
    const after = await stat(paths[index]!, signal);
    if (after?.isFile() && same(before[index], after) && Number.isSafeInteger(after.size)) {
      bytes += after.size;
      known++;
    }
  }
  const afterDirectory = await stat(layout.sessionDir, signal);
  const currentLayout = await locate(store, id, signal);
  // Deletion/replacement makes even successfully sampled components ambiguous.
  if (!directory?.isDirectory() || !afterDirectory?.isDirectory() || directory.dev !== afterDirectory.dev
    || directory.ino !== afterDirectory.ino || currentLayout?.sessionDir !== layout.sessionDir
    || !Number.isSafeInteger(bytes) || known === 0) return unknown();
  const complete = known === paths.length && same(directory, afterDirectory);
  return { status: complete ? 'complete' : 'partial', bytes, sampledAt: new Date().toISOString() };
}
