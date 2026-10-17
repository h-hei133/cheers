import { constants, type Stats } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { assertSessionStoreProfile, projectSessionFileLayout, validateSessionId, type SessionFileLayout, type SessionStoreLayout } from '../sessionFileLayout.js';
import { CATALOG_LIMITS } from './model.js';
import { fileVersion } from '../version.js';

export interface CatalogDirectory {
  readonly layout: SessionFileLayout;
  readonly directory: Stats;
}

export interface CatalogFiles extends CatalogDirectory {
  readonly stats: readonly [Stats, Stats, Stats];
  readonly version: string;
}

/** Physical identity remains usable even when the saved content needs recovery. */
export async function locateCatalogDirectory(store: SessionStoreLayout, id: string, signal?: AbortSignal, onSource?: (target: string) => void): Promise<CatalogDirectory | undefined> {
  assertSessionStoreProfile(store);
  signal?.throwIfAborted();
  if (validateSessionId(id) !== id || id === '.' || id === '..') throw new Error('Invalid session identity.');
  for (const sessionsDir of store.sessionsSearchDirs) {
    signal?.throwIfAborted();
    onSource?.(sessionsDir);
    const layout = projectSessionFileLayout({ sessionsDir, sessionId: id });
    for (const target of Object.values(layout)) assertSessionStoreProfile(store, target);
    onSource?.(layout.sessionDir);
    let directory: Stats;
    try { directory = await lstat(layout.sessionDir); }
    catch (error) {
      signal?.throwIfAborted();
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (!directory.isDirectory()) throw new Error('Session directory is unavailable.');
    signal?.throwIfAborted();
    return { layout, directory };
  }
  return undefined;
}

export async function locateCatalogFiles(store: SessionStoreLayout, id: string, signal?: AbortSignal, onSource?: (target: string) => void): Promise<CatalogFiles | undefined> {
  const found = await locateCatalogDirectory(store, id, signal, onSource);
  if (!found) return undefined;
  const { layout, directory } = found;
  const stats: Stats[] = [];
  for (const file of [layout.metadataPath, layout.statePath, layout.transcriptPath]) {
    signal?.throwIfAborted();
    const stat = await lstat(file);
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size < 0) throw new Error('Session file is unavailable.');
    stats.push(stat);
  }
  signal?.throwIfAborted();
  return { layout, directory, stats: stats as [Stats, Stats, Stats],
    version: JSON.stringify([layout.sessionDir, directory.dev, directory.ino, ...stats.map(fileVersion)]) };
}

/** A finite acquisition bound, checked against the opened object as well as its path. */
export async function readCatalogFile(target: string, expected: Stats, limit: number, signal?: AbortSignal): Promise<string | undefined> {
  signal?.throwIfAborted();
  if (expected.size > limit) return undefined;
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    signal?.throwIfAborted();
    const before = await handle.stat();
    if (JSON.stringify(fileVersion(before)) !== JSON.stringify(fileVersion(expected))) throw new Error('Session changed while reading.');
    const bytes = Buffer.alloc(expected.size);
    let offset = 0;
    while (offset < bytes.length) {
      signal?.throwIfAborted();
      const read = await handle.read(bytes, offset, Math.min(CATALOG_LIMITS.readChunkBytes, bytes.length - offset), offset);
      if (!read.bytesRead) throw new Error('Session changed while reading.');
      offset += read.bytesRead;
    }
    signal?.throwIfAborted();
    const after = await handle.stat();
    if (JSON.stringify(fileVersion(after)) !== JSON.stringify(fileVersion(expected))) throw new Error('Session changed while reading.');
    return bytes.toString('utf8');
  } finally {
    await handle.close();
  }
}
