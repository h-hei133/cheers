import fs from 'node:fs';
import path from 'node:path';
import { NativeGit } from '../read/native.js';
import type { GitSnapshot } from '../read/model.js';
import { assertGitSnapshot, readGitSnapshot } from '../read/snapshot.js';
import { hashBytes } from '../read/fingerprint.js';
import { assertGitParents, verifiedGitBytes, targetVersion } from './files.js';
import type { CheckoutGuard } from './guard.js';

interface FileCopy { readonly name: string; readonly mode: number; readonly bytes?: Buffer; readonly link?: string }
export interface WorktreeTransfer { readonly index: string; readonly files: readonly FileCopy[]; readonly absent: readonly string[]; readonly digest: string }
export async function captureTransfer(git: NativeGit, snapshot: GitSnapshot): Promise<WorktreeTransfer> {
  if (snapshot.files.some(file => file.conflict || file.submodule)) throw new Error('Resolve conflicts and submodule changes before worktree migration.');
  const index = await git.text(['ls-files', '--full-name', '--stage', '-z'], { cwd: snapshot.root });
  if (index.split('\0').some(line => line.startsWith('160000 '))) throw new Error('Submodule worktree migration is unavailable; source was preserved.');
  const listed = await git.text(['ls-files', '--full-name', '-z', '--cached', '--others', '--exclude-standard'], { cwd: snapshot.root });
  const headNames = await git.text(['ls-tree', '--full-tree', '-r', '--name-only', '-z', 'HEAD'], { cwd: snapshot.root });
  const names = [...new Set((listed + headNames).split('\0').filter(Boolean))];
  const files: FileCopy[] = []; const absent: string[] = [];
  for (const name of names) {
    const target = path.join(snapshot.root, name);
    git.assertSourceAccess?.(target);
    try {
      const stat = fs.lstatSync(target);
      assertGitParents(snapshot.root, target);
      if (stat.isSymbolicLink()) files.push({ name, mode: stat.mode, link: fs.readlinkSync(target) });
      else if (stat.isFile() && stat.size <= 128 * 1024 * 1024) files.push({ name, mode: stat.mode, bytes: await verifiedGitBytes(snapshot.root, target) });
      else throw new Error('Worktree migration encountered an unsupported file.');
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') absent.push(name); else throw error; }
  }
  await assertGitSnapshot(git, snapshot);
  return { index, files, absent, digest: hashBytes(JSON.stringify({ index, files: files.map(file => [file.name, file.mode, file.link ?? hashBytes(file.bytes!)]), absent })) };
}
function containedParent(root: string, name: string): string {
  if (path.isAbsolute(name) || name.split('/').some(part => ['..', '.git'].includes(part))) throw new Error('Unsafe worktree transfer path.');
  const target = path.join(root, name);
  assertGitParents(root, target, true);
  return target;
}
/** The approved worktree plan owns these exact native filesystem bytes. */
export async function applyTransfer(git: NativeGit, target: string, transfer: WorktreeTransfer, guard: CheckoutGuard, signal?: AbortSignal): Promise<void> {
  await guard.clean();
  const names = [...transfer.files.map(file => file.name), ...transfer.absent];
  const before = new Map(names.map(name => [name, targetVersion(target, path.join(target, name))]));
  guard.check();
  await git.text(['read-tree', '--empty'], { cwd: target, approved: true, signal });
  guard.bindIndex(); guard.check();
  await git.text(['update-index', '-z', '--index-info'], { cwd: target, approved: true, signal, input: Buffer.from(transfer.index) });
  guard.bindIndex();
  for (const file of transfer.files) {
    signal?.throwIfAborted(); guard.check();
    const destination = containedParent(target, file.name);
    if (targetVersion(target, destination) !== before.get(file.name)) throw new Error('Worktree destination changed during migration; new edits retained.');
    try { if (!fs.lstatSync(destination).isFile() && !fs.lstatSync(destination).isSymbolicLink()) throw new Error('Worktree destination contains a conflicting directory.'); fs.unlinkSync(destination); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    guard.check();
    if (file.link !== undefined) fs.symlinkSync(file.link, destination);
    else { fs.writeFileSync(destination, file.bytes!, { flag: 'wx', mode: file.mode & 0o777 }); fs.chmodSync(destination, file.mode & 0o777); }
  }
  for (const name of transfer.absent) {
    signal?.throwIfAborted(); guard.check(); const destination = containedParent(target, name);
    if (targetVersion(target, destination) !== before.get(name)) throw new Error('Worktree destination changed during migration; new edits retained.');
    try { fs.unlinkSync(destination); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  guard.check();
  const actualIndex = await git.text(['ls-files', '--stage', '-z'], { cwd: target });
  guard.check();
  if (actualIndex !== transfer.index) throw new Error('Transferred staged index could not be confirmed.');
  for (const file of transfer.files) {
    guard.check();
    const destination = path.join(target, file.name); const stat = fs.lstatSync(destination);
    if (file.link !== undefined ? !stat.isSymbolicLink() || fs.readlinkSync(destination) !== file.link
      : !stat.isFile() || (stat.mode & 0o777) !== (file.mode & 0o777) || hashBytes(fs.readFileSync(destination)) !== hashBytes(file.bytes!)) throw new Error('Transferred worktree bytes or mode could not be confirmed.');
  }
  if (transfer.absent.some(name => fs.existsSync(path.join(target, name)))) throw new Error('Transferred deletion could not be confirmed.');
  await guard.finish();
}
export async function verifyTransfer(git: NativeGit, target: string, transfer: WorktreeTransfer, guard: CheckoutGuard): Promise<void> {
  guard.check();
  const current = await readGitSnapshot(new NativeGit(target, git.execution)); guard.check();
  if ((await captureTransfer(new NativeGit(target, git.execution), current)).digest !== transfer.digest) throw new Error('Transferred destination changed before session rebind; new edits retained.');
  await guard.finish();
}
