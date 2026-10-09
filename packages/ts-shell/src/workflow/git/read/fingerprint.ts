import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function hashBytes(bytes: string | Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function fingerprintPath(target: string): string {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) return `link:${fs.readlinkSync(target)}`;
    if (stat.isDirectory()) return `directory:${stat.mode}`;
    if (!stat.isFile() || stat.size > 128 * 1024 * 1024) throw new Error('Git snapshot contains unsupported or oversized files.');
    const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    try {
      const actual = fs.fstatSync(fd);
      if (actual.dev !== stat.dev || actual.ino !== stat.ino) throw new Error('Git snapshot path changed.');
      return `file:${stat.mode}:${hashBytes(fs.readFileSync(fd))}`;
    } finally { fs.closeSync(fd); }
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent'; throw error; }
}
function metadataFiles(root: string, depth = 0): string[] {
  if (depth > 12) throw new Error('Git metadata nesting exceeds inspection limit.');
  try { return fs.readdirSync(root).flatMap(name => {
    const target = path.join(root, name);
    return fs.lstatSync(target).isDirectory() ? metadataFiles(target, depth + 1) : [target];
  }); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
export function snapshotFingerprint(input: { root: string; gitDir: string; commonDir: string; paths: readonly string[]; status: string; refs: string; config: string; ignoredRef?: string; hooksDir?: string; policyPaths?: readonly string[] }): string {
  const metadata = [...new Set([input.gitDir, input.commonDir])].flatMap(dir => [
    ...['index', 'HEAD', 'config', 'config.worktree', 'packed-refs', 'shallow', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REBASE_HEAD'].map(name => path.join(dir, name)),
    ...metadataFiles(path.join(dir, 'refs')), ...metadataFiles(path.join(dir, 'hooks')),
  ]);
  if (input.hooksDir) {
    if (fs.existsSync(input.hooksDir) && fs.realpathSync(input.hooksDir) !== input.hooksDir) throw new Error('Configured Git hook directory is redirected.');
    metadata.push(input.hooksDir, ...metadataFiles(input.hooksDir));
  }
  for (const target of metadata.filter(target => target.includes(path.sep + 'hooks' + path.sep) || input.hooksDir && target.startsWith(input.hooksDir + path.sep))) {
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Linked executable Git hooks require separate inspection; passive snapshot is unavailable.');
  }
  metadata.push(...input.policyPaths ?? []);
  const ignored = input.ignoredRef ? [path.join(input.gitDir, input.ignoredRef), path.join(input.commonDir, input.ignoredRef)] : [];
  const state = [...new Set([...metadata, ...input.paths.map(name => path.join(input.root, name))])].filter(target => !ignored.includes(target)).sort().map(target => {
    let parent = path.dirname(target);
    const root = target.startsWith(input.root + path.sep) ? input.root : target.startsWith(input.gitDir + path.sep) ? input.gitDir : input.hooksDir && target.startsWith(input.hooksDir + path.sep) ? input.hooksDir : input.commonDir;
    while (parent !== root && parent.startsWith(root + path.sep)) {
      try { if (!fs.lstatSync(parent).isDirectory() || fs.realpathSync(parent) !== parent) throw new Error('Git snapshot parent is redirected.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      parent = path.dirname(parent);
    }
    let identity: string | undefined;
    if (input.policyPaths?.includes(target)) {
      try { const stat = fs.lstatSync(target); if (stat.isSymbolicLink() || fs.realpathSync(target) !== target) throw new Error('Git attribute policy path is redirected.'); identity = `${stat.dev}:${stat.ino}`; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    return [target, fingerprintPath(target), identity];
  });
  const identities = [...new Set([input.root, input.gitDir, input.commonDir])].map(root => { const stat = fs.statSync(root); return [root, stat.dev, stat.ino]; });
  return hashBytes(JSON.stringify({ identities, state, status: input.status, refs: input.refs, config: input.config }));
}
