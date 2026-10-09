import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GitArea, GitSnapshot } from '../read/model.js';
import { NativeGit } from '../read/native.js';
import { readGitDiff } from '../read/diff.js';
import { assertGitSnapshot } from '../read/snapshot.js';
import { hashBytes } from '../read/fingerprint.js';
import type { GitPlan } from './model.js';

export function gitPlan(snapshot: GitSnapshot, args: readonly string[], targets: readonly string[], input?: Buffer): GitPlan {
  if (input && input.byteLength > 64000) throw new Error('The complete stdin plan exceeds the approval preview limit. Select a smaller hunk or message.');
  const summary = `git ${args.map(arg => JSON.stringify(arg)).join(' ')}`;
  return Object.freeze({ id: randomUUID(), snapshot, args: Object.freeze([...args]), targets: Object.freeze([...targets]), summary,
    preview: `${summary}\nRepository: ${snapshot.root}\nBranch: ${snapshot.branch}\nHEAD: ${snapshot.head ?? '(unborn)'}\nIndex/refs/config/hooks/attribute policy and readable worktree snapshot: ${snapshot.fingerprint}\n${snapshot.unreadablePaths?.length ? `Source bytes excluded from snapshot (no read access): ${snapshot.unreadablePaths.map(name => JSON.stringify(name)).join(', ')}\n` : ''}${input ? `Complete literal stdin SHA-256: ${hashBytes(input)}\n${input.toString('utf8')}` : ''}`,
    ...(input ? { input: Buffer.from(input) } : {}) });
}
export async function prepareFileChange(git: NativeGit, snapshot: GitSnapshot, action: 'stage' | 'unstage', filePath: string, hunkId?: string): Promise<GitPlan> {
  const file = snapshot.files.find(item => item.path === filePath);
  if (!file) throw new Error('Select a current changed path.');
  for (const name of [file.path, ...(file.originalPath ? [file.originalPath] : [])]) git.assertSourceAccess?.(path.join(snapshot.root, name));
  const area: GitArea = action === 'unstage' ? 'staged' : file.index === '?' ? 'untracked' : 'unstaged';
  if (action === 'unstage' && ['.', '?'].includes(file.index) || action === 'stage' && file.worktree === '.') throw new Error('The selected area has no change.');
  const targets = [file.path, ...(file.originalPath ? [file.originalPath] : [])].map(name => path.join(snapshot.root, name));
  if (hunkId) {
    const diff = await readGitDiff(git, snapshot, area, filePath);
    const hunk = diff.hunks.find(item => item.id === hunkId);
    if (!hunk) throw new Error(diff.hunkReason ?? 'Hunk identity changed. Read the diff again.');
    return gitPlan(snapshot, ['apply', '--cached', '--recount', ...(action === 'unstage' ? ['--reverse'] : []), '-'], targets, Buffer.from(hunk.patch));
  }
  await assertGitSnapshot(git, snapshot);
  const args = action === 'stage' ? ['add', '--', ...targets.map(target => path.relative(snapshot.root, target))]
    : snapshot.head ? ['reset', '-q', 'HEAD', '--', ...targets.map(target => path.relative(snapshot.root, target))]
    : ['update-index', '--force-remove', '--', ...targets.map(target => path.relative(snapshot.root, target))];
  return gitPlan(snapshot, args, targets);
}
export async function prepareCommit(git: NativeGit, snapshot: GitSnapshot, message: string): Promise<GitPlan> {
  if (!message.trim() || Buffer.byteLength(message) > 64000 || message.includes('\0')) throw new Error('Commit message must contain 1–64000 bytes without NUL.');
  if (snapshot.files.some(file => file.conflict)) throw new Error('Resolve the index conflicts before committing.');
  if (!snapshot.files.some(file => !['.', '?'].includes(file.index))) throw new Error('Nothing is staged. No other files were staged.');
  const sources = snapshot.files.filter(file => !['.', '?'].includes(file.index)).flatMap(file => [file.path, ...(file.originalPath ? [file.originalPath] : [])]).map(name => path.join(snapshot.root, name));
  for (const source of sources) git.assertSourceAccess?.(source);
  const index = await git.text(['ls-files', '--full-name', '--stage', '-z'], { cwd: snapshot.root });
  await assertGitSnapshot(git, snapshot);
  return { ...gitPlan(snapshot, ['commit', '--file=-'], [], Buffer.from(message)), sources, commitIndex: hashBytes(index) };
}
export async function prepareBranch(git: NativeGit, snapshot: GitSnapshot, action: 'create' | 'switch' | 'delete', name: string): Promise<GitPlan> {
  if (!name || name.startsWith('-') || name === 'HEAD' || name.includes('\0')) throw new Error('A literal branch name is required.');
  await git.text(['check-ref-format', '--branch', name]);
  if (action === 'delete' && name === snapshot.branch) throw new Error('Cannot delete the current branch.');
  if (action === 'create' && !snapshot.head) throw new Error('Create the first commit before creating another branch.');
  await assertGitSnapshot(git, snapshot);
  return gitPlan(snapshot, action === 'create' ? ['branch', '--', name]
    : action === 'switch' ? ['switch', '--', name] : ['branch', '-d', '--', name], []);
}
