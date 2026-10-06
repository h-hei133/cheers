import fs from 'node:fs';
import path from 'node:path';
import { userDataSearchDirs } from '../../paths/userHome.js';

/** Only a missing entry beneath an accessible directory permits fallback. */
export function isTrustFileMissing(source: string): boolean {
  let candidate = source;
  while (true) {
    try {
      fs.lstatSync(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
      const parent = path.dirname(candidate);
      if (parent === candidate) return false;
      candidate = parent;
      continue;
    }
    if (candidate === source) return false;
    // A dangling ancestor link exists but cannot prove an accessible directory.
    try { return fs.statSync(candidate).isDirectory(); }
    catch { return false; }
  }
}

export function trustSource(): string {
  const candidates = userDataSearchDirs().map(dir => path.join(dir, 'trust.json'));
  return candidates.find(candidate => !isTrustFileMissing(candidate)) ?? candidates[0]!;
}
