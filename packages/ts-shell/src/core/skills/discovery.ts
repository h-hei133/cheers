import fs from 'node:fs';
import path from 'node:path';
import { captureWorkspaceRoot, assertWorkspaceRoot } from '../workspace/roots.js';
import type { WorkspaceRoot } from '../workspace/model.js';
import { readDirectory, observeDirectory, DirectoryReadError } from '../../runtime/execution/directory.js';
import { readBinarySnapshot, SnapshotLimitError } from '../../runtime/execution/snapshot.js';
import { isReadResourceFailure, ReadChangedError, ReadCleanupError, readRevision } from '../../runtime/execution/read.js';
import type { CapturedReadSource } from '../../runtime/execution/types.js';
import { WalkBudget, WalkLimitError, type WalkLimits } from '../../runtime/execution/walk/budget.js';
import { verifyPathContainment } from '../security/pathJail.js';

export class SkillDiscoveryError extends Error {
  constructor() { super('Skill discovery stopped at its resource limit; no complete catalog is available.'); }
}

export class SkillSourceError extends Error {
  constructor() { super('Skill source observation failed; no complete catalog is available.'); this.name = 'SkillSourceError'; }
}

/** One catalog read owns the traversal budget and its selected root identities. */
export class SkillDiscovery {
  readonly budget: WalkBudget;
  private readonly roots = new Map<string, WorkspaceRoot>();
  private readonly captured = new Map<string, CapturedReadSource>();
  private bytes = 0;
  private files = 0;
  constructor(readonly signal?: AbortSignal, limits?: WalkLimits, private readonly onSource?: (target: string, content?: Buffer) => void) {
    this.budget = new WalkBudget(signal, limits);
  }

  /** Observer rejection is admission failure, not an unreadable manifest fallback. */
  observe(target: string, content?: Buffer, observer?: (target: string, content?: Buffer) => void): void {
    this.budget.check();
    try { this.onSource?.(target, content); }
    catch { throw new SkillSourceError(); }
    this.budget.check();
    if (observer && observer !== this.onSource) {
      try { observer(target, content); }
      catch { throw new SkillSourceError(); }
      this.budget.check();
    }
  }

  root(boundary: string): string {
    this.budget.check();
    let root = this.roots.get(boundary);
    if (!root) {
      root = captureWorkspaceRoot(boundary, process.cwd(), 'read');
      this.roots.set(boundary, root);
    }
    assertWorkspaceRoot(root);
    if (fs.realpathSync(boundary) !== root.path) throw new Error('The selected skill root changed.');
    return root.path;
  }

  verify(): void {
    for (const boundary of this.roots.keys()) this.root(boundary);
    for (const source of this.captured.values()) this.verifySource(source);
    this.budget.check();
  }

  /** Keep the earliest successful capture, including aliases used by native queries. */
  capture(source: CapturedReadSource): void {
    const captured = this.captured.get(source.path);
    if (captured) this.verifySource(captured);
    this.verifySource(source);
    if (captured) return;
    if (this.captured.size >= 4096) throw new SkillDiscoveryError();
    this.budget.take('pathBytes', Buffer.byteLength(source.path) + Buffer.byteLength(source.target) + Buffer.byteLength(source.root));
    this.captured.set(source.path, Object.freeze({ ...source }));
  }

  private verifySource(source: CapturedReadSource): void {
    this.budget.check();
    try {
      const checked = verifyPathContainment(source.path, source.root);
      if (!checked.allowed || checked.resolvedPath !== source.target
        || readRevision(fs.statSync(source.target, { bigint: true })) !== source.revision) throw new ReadChangedError();
    } catch (error) {
      if (isReadResourceFailure(error)) throw new SkillDiscoveryError();
      throw new ReadChangedError();
    }
  }

  /** Missing roots depend on their nearest existing parent's revision and binding. */
  async observeParent(file: string, boundary?: string): Promise<void> {
    this.budget.check();
    if (boundary && !verifyPathContainment(file, boundary).allowed) throw new Error('The selected skill path is outside its root.');
    let directory = path.dirname(path.resolve(file));
    for (;;) {
      this.budget.check();
      try {
        if (fs.statSync(directory).isDirectory()) break;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR'))) throw error;
      }
      const parent = path.dirname(directory);
      if (parent === directory) throw new Error('The selected skill parent is not a directory.');
      directory = parent;
    }
    const captured = this.captured.get(directory);
    if (captured) { this.verifySource(captured); return; }
    this.budget.take('directories', 1);
    // This parent is a metadata dependency, never a root for manifest content.
    await observeDirectory(directory, directory, { abortSignal: this.signal,
      onCapturedSource: source => { this.capture({ ...source, root: directory }); },
    });
  }

  async directory(boundary: string, directory: string, depth: number): Promise<fs.Dirent[]> {
    const root = this.root(boundary);
    this.budget.depth(depth);
    this.budget.take('directories', 1);
    const entries = await readDirectory(root, directory, { abortSignal: this.signal,
      checkpoint: () => { this.root(boundary); },
      onCapturedSource: source => { this.capture(source); },
      onEntry: entry => {
        this.budget.take('entries', 1);
        this.budget.take('pathBytes', Buffer.byteLength(path.join(directory, entry.name)));
      },
    });
    this.root(boundary);
    return entries;
  }

  async content(boundary: string, file: string): Promise<Buffer> {
    const root = this.root(boundary);
    const captured = this.captured.get(file);
    if (captured) this.verifySource(captured);
    if (++this.files > 512 || this.bytes >= 8 * 1024 * 1024) throw new SkillDiscoveryError();
    const maximum = Math.min(512 * 1024, 8 * 1024 * 1024 - this.bytes);
    const bytes = await readBinarySnapshot({ absolutePath: file, workspaceRoot: root, abortSignal: this.signal,
      assertFileAccess: () => { this.root(boundary); },
      onCapturedSource: source => { this.capture(source); },
    }, maximum);
    this.bytes += bytes.length;
    this.root(boundary);
    return bytes;
  }

  /** Retained cached fields still occupy this catalog's manifest budget. */
  cached(contents: readonly (readonly string[])[]): void {
    for (const fields of contents) {
      this.budget.check();
      const bytes = fields.reduce((total, field) => total + Buffer.byteLength(field), 0);
      if (++this.files > 512 || this.bytes + bytes > 8 * 1024 * 1024) throw new SkillDiscoveryError();
      this.bytes += bytes;
    }
  }

  rethrow(error: unknown): void {
    if (error instanceof SnapshotLimitError) throw new SkillDiscoveryError();
    if (isReadResourceFailure(error)) throw new SkillDiscoveryError();
    if (error instanceof ReadCleanupError || error instanceof ReadChangedError || error instanceof SkillDiscoveryError || error instanceof SkillSourceError || error instanceof WalkLimitError
      || error instanceof DirectoryReadError && error.reason !== 'unavailable') throw error;
    this.signal?.throwIfAborted();
    this.budget.check();
  }
}
