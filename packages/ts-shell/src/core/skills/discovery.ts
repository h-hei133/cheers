import fs from 'node:fs';
import path from 'node:path';
import { captureWorkspaceRoot, assertWorkspaceRoot } from '../workspace/roots.js';
import type { WorkspaceRoot } from '../workspace/model.js';
import { readDirectory, DirectoryReadError } from '../../runtime/execution/directory.js';
import { readBinarySnapshot, SnapshotLimitError } from '../../runtime/execution/snapshot.js';
import { isReadResourceFailure, ReadChangedError, ReadCleanupError, readRevision } from '../../runtime/execution/read.js';
import { WalkBudget, WalkLimitError, type WalkLimits } from '../../runtime/execution/walk/budget.js';
import { verifyPathContainment } from '../security/pathJail.js';

interface ManifestSource { readonly root: string; readonly target: string; readonly revision: string; }

export class SkillDiscoveryError extends Error {
  constructor() { super('Skill discovery stopped at its resource limit; no complete catalog is available.'); }
}

/** One catalog read owns the traversal budget and its selected root identities. */
export class SkillDiscovery {
  readonly budget: WalkBudget;
  private readonly roots = new Map<string, WorkspaceRoot>();
  private readonly captured = new Map<string, ManifestSource>();
  private bytes = 0;
  private files = 0;
  constructor(readonly signal?: AbortSignal, limits?: WalkLimits) {
    this.budget = new WalkBudget(signal, limits);
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
    for (const [file, source] of this.captured) this.verifySource(file, source);
    this.budget.check();
  }

  private verifySource(file: string, source: ManifestSource): void {
    this.budget.check();
    try {
      const checked = verifyPathContainment(file, source.root);
      if (!checked.allowed || checked.resolvedPath !== source.target
        || readRevision(fs.statSync(source.target, { bigint: true })) !== source.revision) throw new ReadChangedError();
    } catch (error) {
      if (isReadResourceFailure(error)) throw new SkillDiscoveryError();
      throw new ReadChangedError();
    }
  }

  async directory(boundary: string, directory: string, depth: number): Promise<fs.Dirent[]> {
    const root = this.root(boundary);
    this.budget.depth(depth);
    this.budget.take('directories', 1);
    const entries = await readDirectory(root, directory, { abortSignal: this.signal,
      checkpoint: () => { this.root(boundary); },
      onEntry: entry => {
        this.budget.take('entries', 1);
        this.budget.take('pathBytes', Buffer.byteLength(path.join(directory, entry.name)));
      },
    });
    this.root(boundary);
    return entries;
  }

  async content(boundary: string, file: string): Promise<string> {
    const root = this.root(boundary);
    const captured = this.captured.get(file);
    if (captured) this.verifySource(file, captured);
    if (++this.files > 512 || this.bytes >= 8 * 1024 * 1024) throw new SkillDiscoveryError();
    const maximum = Math.min(512 * 1024, 8 * 1024 * 1024 - this.bytes);
    const checked = verifyPathContainment(file, root);
    if (!checked.allowed) throw new Error('Skill manifest is outside the selected root.');
    const before = fs.statSync(checked.resolvedPath, { bigint: true });
    if (before.size > BigInt(maximum)) throw new SkillDiscoveryError();
    const source = { root, target: checked.resolvedPath, revision: readRevision(before) };
    const bytes = await readBinarySnapshot({ absolutePath: file, workspaceRoot: root, abortSignal: this.signal,
      assertFileAccess: () => { this.root(boundary); },
    }, maximum);
    this.bytes += bytes.length;
    this.root(boundary);
    this.verifySource(file, source);
    if (captured) this.verifySource(file, captured);
    else this.captured.set(file, source);
    return bytes.toString('utf8');
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
    if (error instanceof ReadCleanupError || error instanceof ReadChangedError || error instanceof SkillDiscoveryError || error instanceof WalkLimitError
      || error instanceof DirectoryReadError && error.reason !== 'unavailable') throw error;
    this.signal?.throwIfAborted();
    this.budget.check();
  }
}
