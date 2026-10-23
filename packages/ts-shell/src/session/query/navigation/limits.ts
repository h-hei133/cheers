import { lstatSync } from 'node:fs';
import type { SessionReadLimits } from '../../store/sessionStore.js';
import type { SessionFileLayout } from '../../store/sessionFileLayout.js';

/** Per opening: at most 24.25 MiB of source text, then bounded records. */
export const NAVIGATION_LIMITS: SessionReadLimits = Object.freeze({
  metadataBytes: 256 * 1024,
  stateBytes: 8 * 1024 * 1024,
  transcriptBytes: 16 * 1024 * 1024,
  transcriptLines: 50_000,
  entries: 20_000,
});

/** Reject oversized inputs before any of the saved files are parsed. */
export function admitNavigationSource(layout: SessionFileLayout): void {
  for (const [target, limit] of [
    [layout.metadataPath, NAVIGATION_LIMITS.metadataBytes],
    [layout.statePath, NAVIGATION_LIMITS.stateBytes],
    [layout.transcriptPath, NAVIGATION_LIMITS.transcriptBytes],
  ] as const) {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.size > limit) throw new Error('The saved conversation exceeds navigation limits or is unavailable.');
  }
}
