import { constants, promises as fs, lstatSync, realpathSync, statSync, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { closeReadHandle } from '../../../runtime/execution/read.js';
import { openArtifactDirectory, removeOwnedTemporary, sameArtifactRevision, verifyArtifactDirectory } from './directory.js';
import { ArtifactDigest, verifyArtifactContent, writeArtifactSource, type ArtifactReceipt, type ArtifactSource } from './stream.js';

export class ArtifactPublicationError extends Error {
  constructor(readonly publication: 'not-published' | 'unverified' | 'verified', readonly cleanup: 'complete' | 'unknown',
    readonly target: string, readonly cleanupResource?: { close(): Promise<void> }) {
    super(`Artifact publication ${publication}; cleanup ${cleanup}.`); this.name = 'ArtifactPublicationError';
  }
}

/** Descriptor-anchored exclusive publication; renamed ancestors cannot redirect writes. */
export async function publishArtifact(root: string, directory: string, filename: string, source: ArtifactSource,
  signal?: AbortSignal, admit?: () => void): Promise<ArtifactReceipt> {
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
  let writerHandle: FileHandle | undefined;
  const digest = new ArtifactDigest();
  let writeComplete = false;
  try {
    const store = await openArtifactDirectory(root, directory, handles, signal, admit);
    storeHandle = store;
    storeIdentity = await store.stat({ bigint: true });
    anchor = `/proc/self/fd/${store.fd}`;
    const verify = async (): Promise<void> => {
      admit?.(); await verifyArtifactDirectory(store, directory); signal?.throwIfAborted(); admit?.();
    };
    await verify();
    const writer = await fs.open(`${anchor}/${temporary}`, 'wx+', 0o600);
    writerHandle = writer;
    temporaryRemoved = false;
    handles.push(writer);
    temporaryIdentity = await writer.stat({ bigint: true });
    let receipt: ArtifactReceipt;
    receipt = await writeArtifactSource(writer, source, signal, verify, digest);
    await writer.sync();
    temporaryIdentity = await verifyArtifactContent(writer, receipt, signal, verify);
    writeComplete = true;
    await closeReadHandle(writer); handles.splice(handles.indexOf(writer), 1);
    await verify();
    await fs.link(`${anchor}/${temporary}`, `${anchor}/${filename}`);
    published = true;
    await removeOwnedTemporary(`${anchor}/${temporary}`, temporaryIdentity); temporaryRemoved = true;
    const reader = await fs.open(`${anchor}/${filename}`, constants.O_RDONLY | constants.O_NOFOLLOW);
    handles.push(reader);
    try {
      const stats = await reader.stat({ bigint: true });
      if (!temporaryIdentity || !sameArtifactRevision(temporaryIdentity, stats, false)) throw new Error('Artifact publication verification failed.');
      publishedIdentity = await verifyArtifactContent(reader, receipt, signal, verify);
    } finally { await closeReadHandle(reader); handles.splice(handles.indexOf(reader), 1); }
    await store.sync();
    await verify();
    verified = true;
    return receipt;
  } catch {
    // A publication pathname may now belong to an external writer. Preserve it;
    // a failed verification cannot authorize destructive compensation.
    throw new ArtifactPublicationError(published ? 'unverified' : 'not-published', 'complete', path.join(directory, filename));
  } finally {
    const removeTemporary = async (): Promise<void> => {
      if (!anchor || temporaryRemoved) return;
      const target = `${anchor}/${temporary}`;
      try {
        if (!writeComplete && writerHandle) {
          const current = await fs.lstat(target, { bigint: true });
          const opened = await writerHandle.stat({ bigint: true });
          if (!current.isFile() || !sameArtifactRevision(current, opened, false)) { temporaryRemoved = true; return; }
          const checked = await verifyArtifactContent(writerHandle, digest.receipt());
          if (temporaryIdentity && !sameArtifactRevision(temporaryIdentity, checked, false)) throw new Error('Artifact staging identity changed.');
          temporaryIdentity = checked;
        }
        await removeOwnedTemporary(target, temporaryIdentity); temporaryRemoved = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        temporaryRemoved = true;
      }
    };
    if (!temporaryRemoved) try { await removeTemporary(); } catch (error) { temporaryRemoved = (error as NodeJS.ErrnoException).code === 'ENOENT'; }
    const ordered = handles.reverse().filter(handle => temporaryRemoved || handle !== storeHandle && handle !== writerHandle);
    const cleanup = await Promise.allSettled(ordered.map(handle => closeReadHandle(handle)));
    const pending = ordered.filter((_handle, index) => cleanup[index]?.status === 'rejected');
    if (!temporaryRemoved) {
      if (writerHandle && handles.includes(writerHandle)) pending.push(writerHandle);
      if (storeHandle) pending.push(storeHandle);
    }
    if (!temporaryRemoved || pending.length) {
      const resource = { async close(): Promise<void> {
        if (!temporaryRemoved) await removeTemporary();
        const results = await Promise.allSettled(pending.map(handle => closeReadHandle(handle)));
        if (results.some(result => result.status === 'rejected') || !temporaryRemoved) throw new Error('Artifact cleanup is unconfirmed.');
      } };
      throw new ArtifactPublicationError(verified ? 'verified' : published ? 'unverified' : 'not-published', 'unknown', path.join(directory, filename), resource);
    }
    if (verified) {
      try {
        const final = lstatSync(path.join(directory, filename), { bigint: true });
        if (!storeIdentity || !publishedIdentity || realpathSync(directory) !== directory || realpathSync(root) !== root
          || !sameArtifactRevision(storeIdentity, statSync(directory, { bigint: true }), false)
          || !final.isFile() || !sameArtifactRevision(publishedIdentity, final)) throw new Error();
        admit?.(); signal?.throwIfAborted();
      } catch { throw new ArtifactPublicationError('unverified', 'complete', path.join(directory, filename)); }
    }
  }
}

/** Preserve the existing portable text spill contract; binary publication uses verified descriptors. */
export async function publishTextArtifact(root: string, directory: string, filename: string, source: ArtifactSource,
  signal?: AbortSignal, admit?: () => void): Promise<ArtifactReceipt> {
  if (process.platform === 'linux') return publishArtifact(root, directory, filename, source, signal, admit);
  const temporary = path.join(directory, `${filename}.tmp-${randomUUID()}`);
  let writer: FileHandle | undefined;
  let temporaryIdentity: BigIntStats | undefined;
  let created = false;
  let removed = true;
  let published = false;
  const target = path.join(directory, filename);
  try {
    signal?.throwIfAborted(); admit?.();
    await fs.mkdir(directory, { recursive: true });
    const verify = async (): Promise<void> => {
      signal?.throwIfAborted(); admit?.();
      if (realpathSync(directory) !== directory || realpathSync(root) !== root) throw new Error('Artifact directory changed or resolves through a symbolic link.');
    };
    await verify();
    writer = await fs.open(temporary, 'wx', 0o600);
    created = true; removed = false;
    temporaryIdentity = await writer.stat({ bigint: true });
    const receipt = await writeArtifactSource(writer, source, signal, verify);
    await writer.sync(); temporaryIdentity = await writer.stat({ bigint: true });
    await closeReadHandle(writer); writer = undefined;
    await verify();
    await fs.link(temporary, target); published = true;
    await verify();
    return receipt;
  } catch {
    throw new ArtifactPublicationError(published ? 'unverified' : 'not-published', 'complete', target);
  } finally {
    if (writer) {
      try { temporaryIdentity = await writer.stat({ bigint: true }); } catch { /* retain earlier identity */ }
      try { await closeReadHandle(writer); writer = undefined; } catch { /* retain the unconfirmed handle */ }
    }
    if (created && !removed) {
      try { await removeOwnedTemporary(temporary, temporaryIdentity); removed = true; }
      catch (error) { removed = (error as NodeJS.ErrnoException).code === 'ENOENT'; }
    }
    if (!removed || writer) {
      const resource = { async close(): Promise<void> {
        if (!removed) { await removeOwnedTemporary(temporary, temporaryIdentity); removed = true; }
        if (writer) { await closeReadHandle(writer); writer = undefined; }
      } };
      throw new ArtifactPublicationError(published ? 'unverified' : 'not-published', 'unknown', target, resource);
    }
  }
}
