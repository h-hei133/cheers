import { constants, promises as fs, realpathSync, statSync, type BigIntStats } from 'node:fs';
import path from 'node:path';
import type { FileHandle } from 'node:fs/promises';

/** Both capture staging and final publication use this single directory walk. */
export async function openArtifactDirectory(root: string, directory: string, handles: FileHandle[],
  signal?: AbortSignal, admit?: () => void): Promise<FileHandle> {
  const relative = path.relative(root, directory);
  if (!relative || path.isAbsolute(relative) || relative.split(path.sep).some(segment => !segment || segment === '..')) {
    throw new Error('Invalid artifact directory.');
  }
  signal?.throwIfAborted(); admit?.();
  const rootHandle = await fs.open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  handles.push(rootHandle);
  let current = root;
  for (const segment of relative.split(path.sep)) {
    signal?.throwIfAborted(); admit?.();
    const parent = handles[handles.length - 1]!;
    await verifyArtifactDirectory(parent, current);
    signal?.throwIfAborted(); admit?.();
    const child = `/proc/self/fd/${parent.fd}/${segment}`;
    try { await fs.mkdir(child, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    signal?.throwIfAborted(); admit?.();
    const handle = await fs.open(child, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    handles.push(handle);
    current = path.join(current, segment);
    await verifyArtifactDirectory(handle, current);
  }
  signal?.throwIfAborted(); admit?.();
  return handles[handles.length - 1]!;
}

export async function verifyArtifactDirectory(handle: FileHandle, expected: string): Promise<void> {
  const opened = await handle.stat({ bigint: true });
  const current = statSync(expected, { bigint: true });
  if (await fs.realpath(`/proc/self/fd/${handle.fd}`) !== expected || realpathSync(expected) !== expected
    || !opened.isDirectory() || opened.dev !== current.dev || opened.ino !== current.ino) {
    throw new Error('Artifact directory changed or resolves through a symbolic link.');
  }
}

export function sameArtifactRevision(left: BigIntStats, right: BigIntStats, content = true): boolean {
  return left.dev === right.dev && left.ino === right.ino && (!content
    || (left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs));
}

export async function removeOwnedTemporary(target: string, before?: BigIntStats): Promise<void> {
  if (!before) throw new Error('Artifact staging identity is unconfirmed.');
  const current = await fs.lstat(target, { bigint: true });
  // A foreign pathname or modified revision belongs to the external writer.
  if (!current.isFile() || !sameArtifactRevision(before, current, false)) return;
  if (current.size !== before.size || current.mtimeNs !== before.mtimeNs) throw new Error('Artifact staging revision changed; cleanup is unconfirmed.');
  await fs.unlink(target);
}
