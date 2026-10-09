import fs from 'node:fs';
import path from 'node:path';
import { withVerifiedReadTarget } from '../../../runtime/execution/read.js';
import { hashBytes } from '../read/fingerprint.js';

export function assertGitParents(root: string, target: string, create = false): void {
  const relative = path.relative(root, path.dirname(target));
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) || fs.realpathSync(root) !== root) throw new Error('Git path escapes or redirects its root.');
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if (!fs.lstatSync(current).isDirectory() || fs.realpathSync(current) !== current) throw new Error('Git parent path is redirected.'); }
    catch (error) {
      if (!create || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      assertGitParents(root, current);
      fs.mkdirSync(current); if (fs.realpathSync(current) !== current) throw new Error('Created Git parent path is redirected.');
    }
  }
}
export async function verifiedGitBytes(root: string, target: string): Promise<Buffer> {
  assertGitParents(root, target);
  return withVerifiedReadTarget({ workspaceRoot: root, absolutePath: target }, 'file', async (handle, verify) => {
    const bytes = await handle.readFile(); await verify(); return bytes;
  });
}
export function targetVersion(root: string, target: string): string {
  try {
    assertGitParents(root, target); const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) return `link:${stat.ino}:${fs.readlinkSync(target)}`;
    if (!stat.isFile()) throw new Error('Git destination is not a file or link.');
    const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try { if (fs.fstatSync(fd).ino !== stat.ino) throw new Error('Git destination changed.'); return `file:${stat.ino}:${stat.mode}:${hashBytes(fs.readFileSync(fd))}`; }
    finally { fs.closeSync(fd); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'; throw error; }
}
