import fs from 'node:fs';
import path from 'node:path';
export interface CheckoutIdentity { readonly rootIdentity: string; readonly gitDir: string; readonly gitDirIdentity: string }
function identity(target: string): string {
  const stat = fs.lstatSync(target, { bigint: true });
  if (!stat.isDirectory() || fs.realpathSync(target) !== target) throw new Error('Worktree identity is redirected.');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
}
export function checkoutIdentity(root: string): CheckoutIdentity {
  const marker = path.join(root, '.git');
  if (!fs.lstatSync(marker).isFile()) throw new Error('Owned worktree marker is not a regular file.');
  const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(fs.readFileSync(marker, 'utf8'));
  if (!match) throw new Error('Owned worktree Git registration is unavailable.');
  const gitDir = path.resolve(root, match[1]!);
  return { rootIdentity: identity(root), gitDir, gitDirIdentity: identity(gitDir) };
}
export function sameCheckout(root: string, expected: CheckoutIdentity): boolean {
  try { const current = checkoutIdentity(root); return current.rootIdentity === expected.rootIdentity && current.gitDir === expected.gitDir && current.gitDirIdentity === expected.gitDirIdentity; }
  catch { return false; }
}
