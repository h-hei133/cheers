import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export type FileState = { readonly state: 'absent' } | {
  readonly state: 'exists';
  readonly content: string;
  readonly hash: string;
  readonly identity: string;
  readonly mode: number;
};

/** Refuse links in every component, including links that currently stay inside the root. */
export function workspaceFilePath(workspaceRoot: string, relativePath: string): string {
  const root = fs.realpathSync(workspaceRoot);
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || relative.includes('\0')) {
    throw new Error('File target is outside the selected workspace.');
  }
  let current = root;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('File target contains a symlink.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return absolute;
}

export function fileIdentity(stat: fs.Stats): string {
  return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}

export function descriptorPath(fd: number, fallback: string): string {
  if (process.platform === 'linux') return fs.realpathSync(`/proc/self/fd/${fd}`);
  const current = fs.lstatSync(fallback);
  if (fileIdentity(current) !== fileIdentity(fs.fstatSync(fd))) throw new Error('File descriptor identity changed.');
  return fs.realpathSync(fallback);
}

/** Inspection failures and non-files are never converted to an absent file. */
export function inspectWorkspaceFile(root: string, relative: string, assertFileAccess?: (absolutePath: string) => void, maxBytes?: number): FileState {
  const absolute = workspaceFilePath(root, relative);
  assertFileAccess?.(absolute);
  let stat: fs.Stats;
  try { stat = fs.lstatSync(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'absent' };
    throw error;
  }
  if (!stat.isFile()) throw new Error('File target is not a regular file.');
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || fileIdentity(opened) !== fileIdentity(stat)) throw new Error('File target changed identity.');
    const actual = descriptorPath(fd, absolute);
    if (actual !== absolute) {
      assertFileAccess?.(actual);
      throw new Error('File target changed path.');
    }
    assertFileAccess?.(actual);
    if (maxBytes !== undefined && opened.size > maxBytes) throw new Error('File exceeds the edit size limit.');
    const bytes = maxBytes === undefined ? fs.readFileSync(fd) : readBounded(fd, maxBytes);
    const content = bytes.toString('utf8');
    if (!Buffer.from(content, 'utf8').equals(bytes)) throw new Error('File target is not UTF-8 text.');
    const final = fs.fstatSync(fd);
    if (opened.size !== final.size || opened.mtimeMs !== final.mtimeMs || opened.ctimeMs !== final.ctimeMs) throw new Error('File changed during inspection.');
    return { state: 'exists', content, hash: hashContent(content), identity: fileIdentity(opened), mode: opened.mode };
  } finally { fs.closeSync(fd); }
}

function readBounded(fd: number, maxBytes: number): Buffer {
  const bytes = Buffer.alloc(Math.min(fs.fstatSync(fd).size + 1, maxBytes + 1));
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
    if (!count) return bytes.subarray(0, offset);
    offset += count;
  }
  if (offset > maxBytes || fs.readSync(fd, Buffer.alloc(1), 0, 1, null) > 0) throw new Error('File exceeds the edit size limit or changed while reading.');
  return bytes;
}

/** Existing ancestors must remain ordinary directories, including the runtime home. */
export function pathIdentity(target: string): string {
  const parts: string[] = []; let current = path.resolve(target);
  while (true) {
    try { const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || (current !== path.resolve(target) && !stat.isDirectory())) throw new Error('Publication paths must not traverse symlinks or non-directories.');
      parts.push(`${current}:${stat.dev}:${stat.ino}:${stat.isDirectory() ? 'd' : 'f'}`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; parts.push(`${current}:missing`); }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  return parts.join('|');
}
export function readTextFile(target: string, maxBytes: number): string | undefined {
  pathIdentity(target);
  let root = path.dirname(path.resolve(target)); while (!fs.existsSync(root)) root = path.dirname(root);
  const state = inspectWorkspaceFile(root, path.relative(root, target), undefined, maxBytes);
  return state.state === 'exists' ? state.content : undefined;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
