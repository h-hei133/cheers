import { constants, promises as fs, realpathSync, statSync, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { closeReadHandle } from '../../../runtime/execution/read.js';

export class ArtifactPublicationError extends Error {
  constructor(readonly publication: 'not-published' | 'unverified' | 'verified', readonly cleanup: 'complete' | 'unknown',
    readonly target: string, readonly cleanupResource?: { close(): Promise<void> }) {
    super(`Artifact publication ${publication}; cleanup ${cleanup}.`); this.name = 'ArtifactPublicationError';
  }
}

/** Descriptor-anchored exclusive publication; renamed ancestors cannot redirect writes. */
export async function publishArtifact(root: string, directory: string, filename: string, bytes: Buffer, signal?: AbortSignal): Promise<string> {
  if (process.platform !== 'linux') throw new Error('Verified artifact publication is unavailable on this platform.');
  const handles: FileHandle[] = [];
  const temporary = `${filename}.tmp-${randomUUID()}`;
  let anchor: string | undefined;
  let published = false;
  let verified = false;
  let publishedIdentity: BigIntStats | undefined;
  let storeIdentity: BigIntStats | undefined;
  let temporaryRemoved = true;
  let temporaryIdentity: BigIntStats | undefined;
  let storeHandle: FileHandle | undefined;
  try {
    signal?.throwIfAborted();
    const rootHandle = await fs.open(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    handles.push(rootHandle);
    let current = root;
    for (const segment of path.relative(root, directory).split(path.sep)) {
      if (!segment || segment === '..') throw new Error('Invalid artifact directory.');
      const parent = handles[handles.length - 1]!;
      await verifyDirectory(parent, current);
      const child = `/proc/self/fd/${parent.fd}/${segment}`;
      try { await fs.mkdir(child, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const handle = await fs.open(child, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      handles.push(handle);
      current = path.join(current, segment);
      await verifyDirectory(handle, current);
    }
    const store = handles[handles.length - 1]!;
    storeHandle = store;
    storeIdentity = await store.stat({ bigint: true });
    anchor = `/proc/self/fd/${store.fd}`;
    await verifyDirectory(store, directory);
    signal?.throwIfAborted();
    const writer = await fs.open(`${anchor}/${temporary}`, 'wx', 0o600);
    temporaryRemoved = false;
    handles.push(writer);
    temporaryIdentity = await writer.stat({ bigint: true });
    try { await writer.writeFile(bytes, { signal }); await writer.sync(); temporaryIdentity = await writer.stat({ bigint: true }); }
    finally { temporaryIdentity = await writer.stat({ bigint: true }); await closeReadHandle(writer); handles.splice(handles.indexOf(writer), 1); }
    await verifyDirectory(store, directory);
    signal?.throwIfAborted();
    await fs.link(`${anchor}/${temporary}`, `${anchor}/${filename}`);
    published = true;
    await removeOwnedTemporary(`${anchor}/${temporary}`, temporaryIdentity); temporaryRemoved = true;
    const reader = await fs.open(`${anchor}/${filename}`, constants.O_RDONLY | constants.O_NOFOLLOW);
    handles.push(reader);
    let actual: Buffer;
    try {
      const stats = await reader.stat({ bigint: true });
      if (!stats.isFile() || stats.size !== BigInt(bytes.length)) throw new Error('Artifact publication verification failed.');
      actual = await readPublication(reader, bytes.length, signal);
      publishedIdentity = await reader.stat({ bigint: true });
      if (!sameRevision(stats, publishedIdentity)) throw new Error('Artifact publication changed during verification.');
    } finally { await closeReadHandle(reader); handles.splice(handles.indexOf(reader), 1); }
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (createHash('sha256').update(actual).digest('hex') !== hash) throw new Error('Artifact publication verification failed.');
    await store.sync();
    await verifyDirectory(store, directory);
    signal?.throwIfAborted();
    verified = true;
    return hash;
  } catch {
    // A publication pathname may now belong to an external writer. Preserve it;
    // a failed verification cannot authorize destructive compensation.
    throw new ArtifactPublicationError(published ? 'unverified' : 'not-published', 'complete', path.join(directory, filename));
  } finally {
    if (anchor && !temporaryRemoved) try { await removeOwnedTemporary(`${anchor}/${temporary}`, temporaryIdentity); temporaryRemoved = true; } catch (error) { temporaryRemoved = (error as NodeJS.ErrnoException).code === 'ENOENT'; }
    const ordered = handles.reverse().filter(handle => temporaryRemoved || handle !== storeHandle);
    const cleanup = await Promise.allSettled(ordered.map(handle => closeReadHandle(handle)));
    const pending = ordered.filter((_handle, index) => cleanup[index]?.status === 'rejected');
    if (!temporaryRemoved && storeHandle) pending.push(storeHandle);
    if (!temporaryRemoved || pending.length) {
      const resource = { async close(): Promise<void> {
        if (!temporaryRemoved && anchor) { await removeOwnedTemporary(`${anchor}/${temporary}`, temporaryIdentity); temporaryRemoved = true; }
        const results = await Promise.allSettled(pending.map(handle => closeReadHandle(handle)));
        if (results.some(result => result.status === 'rejected') || !temporaryRemoved) throw new Error('Artifact cleanup is unconfirmed.');
      } };
      throw new ArtifactPublicationError(verified ? 'verified' : published ? 'unverified' : 'not-published', 'unknown', path.join(directory, filename), resource);
    }
    if (verified) {
      try {
        if (!storeIdentity || !publishedIdentity || realpathSync(directory) !== directory || realpathSync(root) !== root
          || !sameRevision(storeIdentity, statSync(directory, { bigint: true }), false)
          || !sameRevision(publishedIdentity, statSync(path.join(directory, filename), { bigint: true }))) throw new Error();
      } catch { throw new ArtifactPublicationError('unverified', 'complete', path.join(directory, filename)); }
    }
  }
}

async function removeOwnedTemporary(target: string, before?: BigIntStats): Promise<void> {
  if (!before) throw new Error('Artifact staging identity is unconfirmed.');
  const current = await fs.lstat(target, { bigint: true });
  // Foreign replacements or modified revisions remain the external writer's bytes.
  if (!current.isFile() || current.dev !== before.dev || current.ino !== before.ino
    || current.size !== before.size || current.mtimeNs !== before.mtimeNs) return;
  await fs.unlink(target);
}

function sameRevision(left: BigIntStats, right: BigIntStats, content = true): boolean {
  return left.dev === right.dev && left.ino === right.ino && (!content
    || (left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs));
}

async function readPublication(handle: FileHandle, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
  const result = Buffer.alloc(maxBytes + 1);
  let bytes = 0;
  while (bytes <= maxBytes) {
    signal?.throwIfAborted();
    const read = await handle.read(result, bytes, Math.min(64 * 1024, result.length - bytes), bytes);
    if (!read.bytesRead) break;
    bytes += read.bytesRead;
  }
  if (bytes !== maxBytes) throw new Error('Artifact publication byte verification failed.');
  return result.subarray(0, bytes);
}

/** Preserve the existing portable text spill contract; binary publication uses verified descriptors. */
export async function publishTextArtifact(root: string, directory: string, filename: string, bytes: Buffer): Promise<string> {
  if (process.platform === 'linux') return publishArtifact(root, directory, filename, bytes);
  const temporary = path.join(directory, `${filename}.tmp-${randomUUID()}`);
  try {
    await fs.mkdir(directory, { recursive: true });
    if (realpathSync(directory) !== directory || realpathSync(root) !== root) throw new Error('Artifact directory changed or resolves through a symbolic link.');
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    if (realpathSync(directory) !== directory) throw new Error('Artifact directory changed or resolves through a symbolic link.');
    await fs.link(temporary, path.join(directory, filename));
    return createHash('sha256').update(bytes).digest('hex');
  } finally { await fs.unlink(temporary).catch(() => {}); }
}

async function verifyDirectory(handle: FileHandle, expected: string): Promise<void> {
  const opened = await handle.stat({ bigint: true });
  const current = statSync(expected, { bigint: true });
  if (await fs.realpath(`/proc/self/fd/${handle.fd}`) !== expected || realpathSync(expected) !== expected
    || !opened.isDirectory() || opened.dev !== current.dev || opened.ino !== current.ino) {
    throw new Error('Artifact directory changed or resolves through a symbolic link.');
  }
}
