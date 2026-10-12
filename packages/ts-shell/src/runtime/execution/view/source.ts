import fs, { promises as fsp, type BigIntStats } from 'node:fs';
import path from 'node:path';
import { readBinarySnapshot } from '../snapshot.js';
import { WalkBudget } from '../walk/budget.js';
import { verifyPathContainment } from '../../../core/security/pathJail.js';

export interface NativeViewInput {
  readonly root: string;
  readonly assertFileAccess: (target: string) => void;
  readonly abortSignal?: AbortSignal;
  readonly budget: WalkBudget;
  readonly pruneDirectories?: readonly string[];
}

export class ViewSourceError extends Error {
  constructor() { super('Native enumeration metadata is unavailable, denied, or outside the workspace. No complete native answer is available.'); }
}

function revision(stat: BigIntStats): string {
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

/** Metadata snapshots are bounded separately from source-file placeholders. */
export class ViewSources {
  private readonly captured = new Map<string, string>();
  private readonly aliases = new Map<string, string>();
  private readonly rootIdentity: BigIntStats;
  private bytes = 0;
  constructor(readonly input: NativeViewInput, readonly mirror: string) {
    this.rootIdentity = fs.statSync(input.root, { bigint: true });
  }

  target(file: string): string {
    this.input.budget.check();
    const checked = verifyPathContainment(file, this.input.root);
    if (!checked.allowed) throw new ViewSourceError();
    try {
      for (const start of new Set([path.resolve(file), checked.resolvedPath])) {
        let current = start;
        for (;;) {
          this.input.assertFileAccess(current);
          if (current === this.input.root) break;
          const parent = path.dirname(current);
          if (parent === current) throw new ViewSourceError();
          current = parent;
        }
      }
    }
    catch { this.input.budget.check(); throw new ViewSourceError(); }
    return checked.resolvedPath;
  }

  destination(file: string): string {
    const relative = path.relative(this.input.root, file);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new ViewSourceError();
    return path.join(this.mirror, relative);
  }

  async link(file: string, target: string): Promise<boolean> {
    if (file === target || this.aliases.has(file)) return false;
    if (this.target(file) !== target) throw new ViewSourceError();
    const destination = this.destination(file);
    await fsp.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    // Relative links stay inside the private view both on the host and after mounting.
    await fsp.symlink(path.relative(path.dirname(file), target), destination);
    this.aliases.set(file, target);
    return true;
  }

  async capture(file: string, maximumBytes = 64 * 1024 * 1024): Promise<boolean> {
    file = path.resolve(file);
    const target = this.target(file);
    if (this.captured.has(target)) return this.link(file, target);
    let before: BigIntStats;
    try { before = fs.statSync(target, { bigint: true }); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
      throw new ViewSourceError();
    }
    if (!before.isFile() || before.size > BigInt(maximumBytes) || this.captured.size >= 4096 || this.bytes + Number(before.size) > 64 * 1024 * 1024) throw new ViewSourceError();
    const bytes = await readBinarySnapshot({ absolutePath: target, workspaceRoot: this.input.root,
      assertFileAccess: absolute => this.target(absolute), abortSignal: this.input.abortSignal,
    }, Math.min(maximumBytes, 64 * 1024 * 1024 - this.bytes));
    if (revision(before) !== revision(fs.statSync(target, { bigint: true }))) throw new ViewSourceError();
    const destination = this.destination(target);
    await fsp.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fsp.writeFile(destination, bytes, { mode: 0o600 });
    this.captured.set(target, revision(before));
    this.bytes += bytes.length;
    await this.link(file, target);
    this.input.budget.check();
    return true;
  }

  verify(): void {
    this.input.budget.check();
    const root = fs.statSync(this.input.root, { bigint: true });
    if (fs.realpathSync(this.input.root) !== this.input.root || root.dev !== this.rootIdentity.dev || root.ino !== this.rootIdentity.ino) throw new ViewSourceError();
    for (const [file, target] of this.aliases) {
      if (this.target(file) !== target) throw new ViewSourceError();
    }
    for (const [file, expected] of this.captured) {
      this.target(file);
      if (revision(fs.statSync(file, { bigint: true })) !== expected) throw new ViewSourceError();
    }
  }
}
