import fs from 'node:fs';
import path from 'node:path';
import { hashContent } from './content.js';

export type FileState = { readonly state: 'absent' } | {
  readonly state: 'exists';
  readonly content: string;
  readonly hash: string;
  readonly identity: string;
  readonly mode: number;
};

export type FileExpectation = { readonly state: 'absent' } | {
  readonly state: 'exists';
  readonly hash?: string;
  readonly content?: string;
  readonly identity?: string;
  readonly mode?: number;
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
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
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

export function matchesFileState(actual: FileState, expected: FileExpectation): boolean {
  return actual.state === expected.state && (actual.state === 'absent' || (expected.state === 'exists'
    && (expected.hash === undefined || actual.hash === expected.hash)
    && (expected.content === undefined || actual.content === expected.content)
    && (expected.identity === undefined || actual.identity === expected.identity)
    && (expected.mode === undefined || (actual.mode & 0o777) === (expected.mode & 0o777))));
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

export function ensureWorkspaceDirectory(root: string, relative: string): void {
  const absolute = workspaceFilePath(root, path.join(relative, '.directory-check'));
  const directory = path.dirname(absolute);
  const canonical = fs.realpathSync(root);
  let current = canonical;
  let fd = fs.openSync(canonical, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    for (const component of path.relative(canonical, directory).split(path.sep).filter(Boolean)) {
      if (descriptorPath(fd, current) !== current) throw new Error('Workspace parent changed path.');
      const anchored = process.platform === 'linux' ? `/proc/self/fd/${fd}` : current;
      const child = path.join(anchored, component);
      try { fs.mkdirSync(child, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const next = fs.openSync(child, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0));
      fs.closeSync(fd);
      fd = next;
      current = path.join(current, component);
      if (descriptorPath(fd, current) !== current || fileIdentity(fs.lstatSync(current)) !== fileIdentity(fs.fstatSync(fd))) {
        throw new Error('Workspace parent changed identity.');
      }
    }
  } finally { fs.closeSync(fd); }
}
