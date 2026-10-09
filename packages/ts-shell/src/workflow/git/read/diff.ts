import { NativeGit } from './native.js';
import type { GitArea, GitDiff, GitHunk, GitSnapshot } from './model.js';
import { hashBytes } from './fingerprint.js';
import { assertGitSnapshot } from './snapshot.js';

export function parseGitHunks(text: string): GitHunk[] {
  const lines: string[] = Array.from(text.match(/[^\n]*\n|[^\n]+$/g) ?? []);
  const first = lines.findIndex(line => line.startsWith('@@ '));
  if (first < 0) return [];
  const header = lines.slice(0, first).join('');
  const starts = lines.flatMap((line, index) => line.startsWith('@@ ') ? [index] : []);
  return starts.map((start, index) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(lines[start]!);
    if (!match) throw new Error('Git returned an invalid hunk.');
    const patch = header + lines.slice(start, starts[index + 1] ?? lines.length).join('');
    return { id: hashBytes(patch).slice(0, 16), oldStart: Number(match[1]), newStart: Number(match[2]), header: lines[start]!.trimEnd(), patch };
  });
}
export async function readGitDiff(git: NativeGit, snapshot: GitSnapshot, area: GitArea, filePath: string): Promise<GitDiff> {
  const file = snapshot.files.find(item => item.path === filePath);
  if (!file) throw new Error('Select a current changed path.');
  for (const name of [file.path, ...(file.originalPath ? [file.originalPath] : [])]) git.assertSourceAccess?.(path.join(snapshot.root, name));
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--full-index', '--src-prefix=a/', '--dst-prefix=b/', '--unified=3'];
  const text = area === 'untracked'
    ? await git.text([...args, '--no-index', '--', '/dev/null', file.path], { cwd: snapshot.root, acceptedCodes: [0, 1] })
    : await git.text([...args, ...(area === 'staged' ? ['--cached'] : []), '--', file.path, ...(file.originalPath ? [file.originalPath] : [])], { cwd: snapshot.root });
  await assertGitSnapshot(git, snapshot);
  const limited = text.length > 240_000;
  const binary = text.includes('Binary files ') || text.includes('GIT binary patch');
  const hunkReason = file.conflict ? 'Conflicts require full-file resolution; hunk staging is unavailable.'
    : file.originalPath ? 'Rename identity is staged or unstaged as a complete file.'
    : binary ? 'Binary changes are staged or unstaged as a complete file.'
    : limited ? 'Diff exceeds the hunk preview limit. Full-file operations remain available.'
    : area === 'untracked' ? 'New untracked files use full-file staging.' : undefined;
  return { path: file.path, area, snapshot, text: limited ? text.slice(0, 240_000) + '\n[Diff preview truncated; remaining content was not shown. Full-file staging preserves bytes.]\n' : text,
    binary, limited, hunks: hunkReason ? [] : parseGitHunks(text), ...(hunkReason ? { hunkReason } : {}) };
}
import path from 'node:path';
