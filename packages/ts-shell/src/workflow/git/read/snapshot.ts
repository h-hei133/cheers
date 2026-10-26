import fs from 'node:fs';
import path from 'node:path';
import { NativeGit } from './native.js';
import { parseGitStatus } from './status.js';
import { snapshotFingerprint } from './fingerprint.js';
import type { GitSnapshot } from './model.js';

export async function readGitSnapshot(git: NativeGit, approved = false, allowedRef?: { readonly branch: string; readonly head: string }, signal?: AbortSignal): Promise<GitSnapshot> {
  signal?.throwIfAborted();
  if (!approved) await git.assertPassive(signal);
  const root = fs.realpathSync((await git.text(['rev-parse', '--show-toplevel'], { signal })).trim());
  const gitDir = fs.realpathSync(path.resolve(root, (await git.text(['rev-parse', '--git-dir'], { cwd: root, signal })).trim()));
  const commonDir = fs.realpathSync(path.resolve(root, (await git.text(['rev-parse', '--git-common-dir'], { cwd: root, signal })).trim()));
  const [status, refs, config, tracked, branch, head, hookPath, attributesFile] = await Promise.all([
    git.text(['status', '--porcelain=v2', '-z', '--untracked-files=all'], { approved, cwd: root, signal }),
    git.text(['for-each-ref', '--format=%(refname) %(objectname)'], { cwd: root, signal }),
    git.text(['config', '--list', '--show-origin', '-z'], { cwd: root, signal }),
    git.text(['ls-files', '--full-name', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, signal }),
    git.text(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root, acceptedCodes: [0, 1], signal }),
    git.text(['rev-parse', '--verify', 'HEAD'], { cwd: root, acceptedCodes: [0, 128], signal }),
    git.text(['config', '--path', '--get', 'core.hooksPath'], { cwd: root, acceptedCodes: [0, 1], signal }),
    git.text(['config', '--path', '--get', 'core.attributesFile'], { cwd: root, acceptedCodes: [0, 1], signal }),
  ]);
  const files = parseGitStatus(status);
  const paths = [...new Set([...tracked.split('\0').filter(Boolean), ...files.flatMap(file => [file.path, ...(file.originalPath ? [file.originalPath] : [])])])];
  for (const name of paths) if (path.isAbsolute(name) || name.split('/').includes('..') || name.split('/').includes('.git')) throw new Error('Git returned an unsafe path.');
  const readablePaths = paths.filter(name => { try { git.assertSourceAccess?.(path.join(root, name)); return true; } catch { return false; } });
  const attributePaths = [path.join(gitDir, 'info', 'attributes'), path.join(commonDir, 'info', 'attributes'),
    attributesFile.trim() ? path.resolve(root, attributesFile.trim()) : path.join(git.env.XDG_CONFIG_HOME ?? path.join(git.env.HOME ?? git.env.USERPROFILE ?? root, '.config'), 'git', 'attributes'),
    ...(git.env.GIT_ATTR_NOSYSTEM === '1' ? [] : [git.env.GIT_ATTR_SYSTEM ?? '/etc/gitattributes'])];
  for (const name of paths) {
    let directory = path.dirname(path.join(root, name));
    while (directory === root || directory.startsWith(root + path.sep)) { attributePaths.push(path.join(directory, '.gitattributes')); if (directory === root) break; directory = path.dirname(directory); }
  }
  const refName = allowedRef ? `refs/heads/${allowedRef.branch}` : undefined;
  if (allowedRef && !refs.split('\n').includes(`${refName} ${allowedRef.head}`)) throw new Error('GIT_STATE_CHANGED: approved worktree branch identity changed.');
  const fingerprint = snapshotFingerprint({ root, gitDir, commonDir, paths: readablePaths, status,
    refs: refName ? refs.split('\n').filter(line => !line.startsWith(refName + ' ')).join('\n') : refs,
    config, policyPaths: attributePaths, ...(hookPath.trim() ? { hooksDir: path.resolve(root, hookPath.trim()) } : {}), ...(refName ? { ignoredRef: refName } : {}) });
  signal?.throwIfAborted();
  return { root, gitDir, commonDir, executionIdentity: git.identity(), head: /^[a-f\d]{40,64}\n?$/.test(head) ? head.trim() : null,
    unreadablePaths: paths.filter(name => !readablePaths.includes(name)),
    branch: branch.trim() || '(detached)', files, branches: refs.split('\n').filter(line => line.startsWith('refs/heads/')).map(line => line.split(' ')[0]!.slice(11)), fingerprint };
}
export async function assertGitSnapshot(git: NativeGit, expected: GitSnapshot, approved = false, allowedRef?: { readonly branch: string; readonly head: string }, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (git.identity() !== expected.executionIdentity) throw new Error('GIT_STATE_CHANGED: Git executable or process environment changed.');
  const current = await readGitSnapshot(git, approved, allowedRef, signal);
  signal?.throwIfAborted();
  if (current.root !== expected.root || current.fingerprint !== expected.fingerprint) throw new Error('GIT_STATE_CHANGED: index, worktree, refs or executable configuration changed. Refresh and prepare a new operation.');
}
