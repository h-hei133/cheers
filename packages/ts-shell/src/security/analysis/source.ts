import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import type { SourceSnapshot } from './model.js';

export function digest(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function exactFile(root: string, selected: string): string {
  const absolute = path.resolve(root, selected); const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Security target is outside the exact workspace.');
  let current = root;
  for (const part of relative.split(path.sep)) { current = path.join(current, part); if (lstatSync(current).isSymbolicLink()) throw new Error('Security inputs cannot use symbolic links.'); }
  if (realpathSync(absolute) !== absolute) throw new Error('Security input identity is not canonical.');
  return absolute;
}
export function snapshotFile(absolute: string, limit: number, decodeText = true): { snapshot: SourceSnapshot; text: string } {
  let descriptor: number | undefined;
  try {
    const entry = lstatSync(absolute);
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('file');
    descriptor = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size > BigInt(limit)) throw new Error('size');
    const chunks: Buffer[] = []; let count = 0; const chunk = Buffer.alloc(Math.min(limit + 1, 64 * 1024));
    for (;;) {
      const size = readSync(descriptor, chunk, 0, Math.min(chunk.length, limit - count + 1), count);
      if (!size) break; count += size; if (count > limit) throw new Error('size'); chunks.push(Buffer.from(chunk.subarray(0, size)));
    }
    const bytes = Buffer.concat(chunks, count); const after = fstatSync(descriptor, { bigint: true });
    const identity = `${before.dev}:${before.ino}:${before.birthtimeMs}:${before.mtimeNs}:${before.ctimeNs}`;
    const named = lstatSync(absolute, { bigint: true });
    if (bytes.length > limit || named.isSymbolicLink() || named.dev !== before.dev || named.ino !== before.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error('changed');
    return { snapshot: { path: absolute, digest: digest(bytes), bytes: bytes.length, identity }, text: decodeText ? bytes.toString('utf8') : '' };
  } catch { throw new Error('Security input is missing, unavailable, changed or exceeds its size limit.'); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
export function workspaceIdentity(root: string): string { return captureWorkspaceRoot(root, root, 'read').identity; }
export function assertSnapshot(snapshot: SourceSnapshot, limit: number): void {
  const current = snapshotFile(snapshot.path, limit, false).snapshot;
  if (current.digest !== snapshot.digest || current.identity !== snapshot.identity || current.bytes !== snapshot.bytes) throw new Error('Security input changed after preparation.');
}
