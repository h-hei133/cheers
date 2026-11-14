import { promises as fs, realpathSync, statSync, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { closeReadHandle } from '../../../runtime/execution/read.js';
import { openArtifactDirectory, removeOwnedTemporary, sameArtifactRevision, verifyArtifactDirectory } from './directory.js';
import { ArtifactPublicationError } from './publication.js';
import { ARTIFACT_CHUNK_BYTES, ArtifactDigest, verifyArtifactContent, writeArtifactChunk, type ArtifactReceipt } from './stream.js';

/** close seals the writer; its original descriptor remains owned until dispose. */
export interface TextStaging {
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
  read(): AsyncIterable<Uint8Array>;
  dispose(): Promise<void>;
}

export async function createTextStaging(root: string, directory: string, signal?: AbortSignal,
  admit?: () => void): Promise<TextStaging> {
  const handles: FileHandle[] = [];
  let staging: OwnedTextStaging | undefined;
  try {
    signal?.throwIfAborted(); admit?.();
    const store = process.platform === 'linux' ? await openArtifactDirectory(root, directory, handles, signal, admit) : undefined;
    if (!store) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    signal?.throwIfAborted(); admit?.();
    if (realpathSync(root) !== root || realpathSync(directory) !== directory) throw new Error('Artifact directory changed.');
    const directoryIdentity = statSync(directory, { bigint: true });
    const filename = `capture.tmp-${randomUUID()}`;
    const target = path.join(directory, filename);
    const anchored = store ? `/proc/self/fd/${store.fd}/${filename}` : target;
    const handle = await fs.open(anchored, 'wx+', 0o600);
    handles.push(handle);
    staging = new OwnedTextStaging(root, directory, target, anchored, store, handle, handles,
      directoryIdentity, signal, admit);
    await staging.initialize();
    await staging.check();
    return staging;
  } catch {
    if (staging) await staging.dispose();
    else {
      const results = await Promise.allSettled(handles.map(handle => closeReadHandle(handle)));
      const pending = handles.filter((_handle, index) => results[index]?.status === 'rejected');
      if (pending.length) {
        const resource = { async close(): Promise<void> {
          const cleanup = await Promise.allSettled(pending.map(handle => closeReadHandle(handle)));
          if (cleanup.some(result => result.status === 'rejected')) throw new Error('Artifact cleanup is unconfirmed.');
        } };
        throw new ArtifactPublicationError('not-published', 'unknown', directory, resource);
      }
    }
    throw new ArtifactPublicationError('not-published', 'complete', directory);
  }
}

class OwnedTextStaging implements TextStaging {
  private readonly digest = new ArtifactDigest();
  private sealed: ArtifactReceipt | undefined;
  private failure = false;
  private closing: Promise<void> | undefined;
  private disposing: Promise<void> | undefined;
  private disposed = false;
  private reading = false;
  private writing = false;
  private removed = false;
  private pending: FileHandle[];
  private identity: BigIntStats | undefined;

  constructor(private readonly root: string, private readonly directory: string, private readonly target: string,
    private readonly anchored: string, private readonly store: FileHandle | undefined, private readonly handle: FileHandle,
    handles: FileHandle[], private readonly directoryIdentity: BigIntStats,
    private readonly signal?: AbortSignal, private readonly admit?: () => void) {
    this.pending = [...handles].reverse();
  }

  async initialize(): Promise<void> {
    try { this.identity = await this.handle.stat({ bigint: true }); }
    catch (error) { this.failure = true; throw error; }
  }

  async check(): Promise<void> {
    if (this.disposed) throw new Error('Artifact staging is disposed.');
    this.signal?.throwIfAborted(); this.admit?.();
    if (this.store) await verifyArtifactDirectory(this.store, this.directory);
    if (realpathSync(this.root) !== this.root || realpathSync(this.directory) !== this.directory
      || !sameArtifactRevision(this.directoryIdentity, statSync(this.directory, { bigint: true }), false)) throw new Error('Artifact directory changed.');
    const current = await fs.lstat(this.anchored, { bigint: true });
    const opened = await this.handle.stat({ bigint: true });
    if (!this.identity || !current.isFile() || !opened.isFile() || !sameArtifactRevision(current, opened)
      || !sameArtifactRevision(this.identity, opened)) throw new Error('Artifact staging changed.');
    this.signal?.throwIfAborted(); this.admit?.();
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!(bytes instanceof Uint8Array)) throw new Error('Artifact source must yield bytes.');
    if (this.closing || this.failure || this.disposed || this.writing) throw new Error('Artifact staging is closed or busy.');
    this.writing = true;
    try {
      for (let offset = 0; offset < bytes.byteLength; offset += ARTIFACT_CHUNK_BYTES) {
        await this.check();
        await writeArtifactChunk(this.handle, bytes.subarray(offset, offset + ARTIFACT_CHUNK_BYTES), this.digest,
          this.signal, () => this.checkWriteRevision());
      }
      await this.check();
    } catch {
      this.failure = true;
      throw this.failureWithResource();
    } finally { this.writing = false; }
  }

  private async checkWriteRevision(): Promise<void> {
    const next = await this.handle.stat({ bigint: true });
    if (!this.identity || !next.isFile() || !sameArtifactRevision(this.identity, next, false) || next.size !== BigInt(this.digest.totalBytes)) {
      throw new Error('Artifact staging changed.');
    }
    this.identity = next;
    await this.check();
  }

  close(): Promise<void> {
    this.closing ??= this.seal();
    return this.closing;
  }

  private async seal(): Promise<void> {
    if (this.failure || this.writing) throw this.failureWithResource();
    try {
      await this.check(); await this.handle.sync(); await this.check();
      const receipt = this.digest.receipt();
      await verifyArtifactContent(this.handle, receipt, this.signal, () => this.check());
      this.sealed = receipt;
    } catch {
      this.failure = true;
      throw this.failureWithResource();
    }
  }

  async *read(): AsyncIterable<Uint8Array> {
    if (!this.sealed || this.failure || this.reading || this.disposed) throw new Error('Artifact staging source is unavailable.');
    this.reading = true;
    try {
      await this.check();
      const digest = new ArtifactDigest();
      const buffer = Buffer.alloc(ARTIFACT_CHUNK_BYTES);
      while (digest.totalBytes < this.sealed.totalBytes) {
        await this.check();
        const result = await this.handle.read(buffer, 0, Math.min(buffer.length, this.sealed.totalBytes - digest.totalBytes), digest.totalBytes);
        if (!result.bytesRead) throw new Error('Artifact staging source changed.');
        digest.record(buffer.subarray(0, result.bytesRead));
        await this.check();
        // Consumers can retain their yielded block without borrowing our buffer.
        yield Buffer.from(buffer.subarray(0, result.bytesRead));
      }
      await this.check();
      if ((await this.handle.read(buffer, 0, 1, this.sealed.totalBytes)).bytesRead
        || digest.receipt().sha256 !== this.sealed.sha256) throw new Error('Artifact staging source changed.');
      await this.check();
    } catch {
      this.failure = true;
      throw this.failureWithResource();
    } finally { this.reading = false; }
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.disposing ??= this.cleanup().catch(() => {
      this.disposing = undefined;
      const resource = { close: (): Promise<void> => this.dispose() };
      throw new ArtifactPublicationError('not-published', 'unknown', this.target, resource);
    });
    return this.disposing;
  }

  private failureWithResource(): ArtifactPublicationError {
    return new ArtifactPublicationError('not-published', 'unknown', this.target, { close: () => this.dispose() });
  }

  private async cleanup(): Promise<void> {
    if (!this.removed) {
      // Exclusive creation still owns this open object if its initial stat
      // failed. Keep its descriptor until a later identity capture can settle.
      if (!this.identity) this.identity = await this.handle.stat({ bigint: true });
      try {
        const current = await fs.lstat(this.anchored, { bigint: true });
        if (!current.isFile() || !sameArtifactRevision(this.identity, current, false)) this.removed = true;
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') this.removed = true; else throw error; }
      if (this.failure && !this.removed) {
        try { await verifyArtifactContent(this.handle, this.digest.receipt()); }
        catch (error) {
          // Removal by an external owner can settle our descriptor even when
          // the failed source no longer contains the expected digest.
          try { await fs.lstat(this.anchored); } catch (missing) {
            if ((missing as NodeJS.ErrnoException).code === 'ENOENT') this.removed = true;
          }
          if (!this.removed) throw error;
        }
      }
      if (!this.store && !this.removed && this.pending.includes(this.handle)) {
        await closeReadHandle(this.handle);
        this.pending.splice(this.pending.indexOf(this.handle), 1);
      }
      if (!this.removed) {
        try { await removeOwnedTemporary(this.anchored, this.identity); this.removed = true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') this.removed = true; }
      }
    }
    const ordered = this.pending.filter(handle => this.removed || handle !== this.store && handle !== this.handle);
    const results = await Promise.allSettled(ordered.map(handle => closeReadHandle(handle)));
    this.pending = ordered.filter((_handle, index) => results[index]?.status === 'rejected');
    if (!this.removed) {
      if (this.store && !ordered.includes(this.handle)) this.pending.push(this.handle);
      if (this.store) this.pending.push(this.store);
    }
    if (!this.removed || this.pending.length) throw new Error('Artifact cleanup is unconfirmed.');
  }
}
