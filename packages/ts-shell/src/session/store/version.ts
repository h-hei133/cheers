import { lstatSync, type Stats } from 'node:fs';
import type { SessionFileLayout } from './sessionFileLayout.js';

export function fileVersion(stat: Stats): readonly number[] {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeMs, stat.ctimeMs];
}

/** Optimistic source version for a synchronous full-session acquisition. */
export function readSessionFileVersion(layout: SessionFileLayout): string {
  const directory = lstatSync(layout.sessionDir);
  if (!directory.isDirectory()) throw new Error('Session directory is unavailable.');
  const files = [layout.metadataPath, layout.statePath, layout.transcriptPath].map(target => {
    const stat = lstatSync(target);
    if (!stat.isFile()) throw new Error('Session file is unavailable.');
    return fileVersion(stat);
  });
  return JSON.stringify([layout.sessionDir, directory.dev, directory.ino, ...files]);
}
