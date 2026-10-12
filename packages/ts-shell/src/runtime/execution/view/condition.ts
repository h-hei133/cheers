import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ViewSources, ViewSourceError } from './source.js';
import { ReadCleanupError } from '../read.js';
import type { GitMetadata } from './git.js';

export async function withInertConfiguration<T>(sources: ViewSources, metadata: GitMetadata, consume: () => Promise<T>): Promise<T> {
  const identity = randomUUID();
  const original = sources.destination(path.join(metadata.common, 'config'));
  const saved = `${original}.read-${identity}`;
  let moved = false;
  try {
    try { await fs.rename(original, saved); moved = true; }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    // Condition matching needs Git's repository identity and HEAD, but no raw
    // repository includes may run while their dependencies are still pending.
    // Omitting extensions.worktreeConfig also disables the original worktree
    // config for this temporary setup.
    await fs.writeFile(original, '[core]\nrepositoryFormatVersion = 0\n', { mode: 0o600, flag: 'wx' });
    return await consume();
  } finally {
    try { await fs.rm(original, { force: true }); if (moved) await fs.rename(saved, original); }
    catch { throw new ReadCleanupError(); }
  }
}

/** Let Git evaluate its own wildmatch rules using an inert include target. */
export async function conditionApplies(sources: ViewSources, metadata: GitMetadata, origin: string, condition: string,
  query: (args: readonly string[]) => Promise<string | null>): Promise<boolean> {
  // Remote-URL conditions need the full scan-ahead graph. The configuration
  // owner admits their dependencies before native evaluation, not this probe.
  if (condition.startsWith('hasconfig:')) throw new ViewSourceError();
  if (/[\r\n\0]/.test(condition)) throw new ViewSourceError();
  const identity = randomUUID();
  const probe = path.join(path.dirname(origin), `.read-condition-${identity}`);
  const sentinel = path.join(path.dirname(origin), `.read-sentinel-${identity}`);
  const quoted = condition.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  try {
    await fs.writeFile(sources.destination(sentinel), '[readview]\nactive = true\n', { mode: 0o600, flag: 'wx' });
    await fs.writeFile(sources.destination(probe), `[includeIf "${quoted}"]\npath = .read-sentinel-${identity}\n`, { mode: 0o600, flag: 'wx' });
    const output = await withInertConfiguration(sources, metadata,
      () => query(['config', '--includes', '--file', probe, '--show-origin', '--null', '--list']));
    if (output === null) throw new ViewSourceError();
    return output.split('\0').some(field => field === 'readview.active\ntrue');
  } finally {
    try {
      await fs.rm(sources.destination(probe), { force: true });
      await fs.rm(sources.destination(sentinel), { force: true });
    } catch { throw new ReadCleanupError(); }
  }
}
