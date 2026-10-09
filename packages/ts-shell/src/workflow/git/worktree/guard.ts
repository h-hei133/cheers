import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { NativeGit } from '../read/native.js';
import { readGitSnapshot } from '../read/snapshot.js';
import { assertGitParents, verifiedGitBytes, targetVersion } from './files.js';
import { sameCheckout, type CheckoutIdentity } from './identity.js';

export function treeIndex(tree: string): string {
  return tree.replace(/(^|\0)(\d+) (?:blob|commit) ([a-f\d]+)\t/g, '$1$2 $3 0\t');
}
/** One created registration owns only its approved HEAD and exact checkout bytes. */
export class CheckoutGuard {
  private indexIdentity?: string;
  private readonly cleanVersions = new Map<string, string>();
  constructor(readonly git: NativeGit, readonly identity: CheckoutIdentity, readonly branch: string, readonly head: string, readonly cleanIndex: string) {}
  check(index = true): void {
    if (!sameCheckout(this.git.root, this.identity) || fs.readFileSync(path.join(this.identity.gitDir, 'HEAD'), 'utf8').trim() !== `ref: refs/heads/${this.branch}`) throw new Error('Owned worktree identity or branch changed; destination retained.');
    const common = path.resolve(this.identity.gitDir, fs.readFileSync(path.join(this.identity.gitDir, 'commondir'), 'utf8').trim());
    let head: string;
    try { head = fs.readFileSync(path.join(common, 'refs', 'heads', this.branch), 'utf8').trim(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; head = fs.readFileSync(path.join(common, 'packed-refs'), 'utf8').split('\n').find(line => line.endsWith(` refs/heads/${this.branch}`))?.split(' ')[0] ?? ''; }
    if (head !== this.head) throw new Error('Owned worktree HEAD changed; destination retained.');
    if (index && this.indexIdentity !== undefined && this.indexVersion() !== this.indexIdentity) throw new Error('Worktree index changed during migration; destination retained.');
  }
  private indexVersion(): string {
    const stat = fs.statSync(path.join(this.identity.gitDir, 'index'));
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${createHash('sha256').update(fs.readFileSync(path.join(this.identity.gitDir, 'index'))).digest('hex')}`;
  }
  bindIndex(): void { this.check(false); this.indexIdentity = this.indexVersion(); }
  async clean(): Promise<void> {
    this.check(); const snapshot = await readGitSnapshot(this.git); this.check();
    if (snapshot.branch !== this.branch || snapshot.head !== this.head || snapshot.files.length) throw new Error('Worktree destination changed before migration; new edits retained.');
    const index = await this.git.text(['ls-files', '--full-name', '--stage', '-z']); this.check();
    if (index !== this.cleanIndex) throw new Error('Created worktree index differs from the approved HEAD; destination retained.');
    for (const entry of this.cleanIndex.split('\0').filter(Boolean)) {
      this.check(); const match = /^(\d+) ([a-f\d]+) 0\t([\s\S]+)$/.exec(entry);
      if (!match || match[1] === '160000') throw new Error('Clean worktree contains an unsupported index entry.');
      const target = path.join(this.git.root, match[3]!); assertGitParents(this.git.root, target); const stat = fs.lstatSync(target);
      const version = targetVersion(this.git.root, target);
      if (this.cleanVersions.has(target) && this.cleanVersions.get(target) !== version) throw new Error('Created worktree file identity, bytes, links or mode changed; new edits retained.');
      const bytes = match[1] === '120000' && stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(target)) : stat.isFile() ? await verifiedGitBytes(this.git.root, target) : undefined;
      this.check();
      const object = bytes ? (await this.git.text(['hash-object', '--no-filters', '--stdin'], { input: bytes })).trim() : undefined; this.check();
      if (!bytes || (match[1] !== '120000' && ((stat.mode & 0o111) !== 0) !== (match[1] === '100755'))
        || object !== match[2]) throw new Error('Created worktree bytes, links or mode differ from the approved HEAD. Converted checkout bytes cannot be verified exactly for migration; destination retained.');
      this.cleanVersions.set(target, version);
    }
    this.bindIndex();
  }
  async finish(): Promise<void> {
    this.check();
    if ((await this.git.text(['rev-parse', '--verify', 'HEAD'])).trim() !== this.head) throw new Error('Created worktree HEAD changed; destination retained.');
    this.check();
  }
}
