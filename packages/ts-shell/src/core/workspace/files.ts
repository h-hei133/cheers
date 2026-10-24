import fs from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyPathContainment } from '../security/pathJail.js';

export type FileState = { readonly state: 'absent' } | {
  readonly state: 'exists';
  readonly content: string;
  readonly hash: string;
  readonly identity: string;
  readonly mode: number;
};

/** Validate the source pathname before converting it to a workspace-relative path. */
export function workspaceRelativePath(workspaceRoot: string, targetPath: string): string {
  const root = path.resolve(workspaceRoot);
  const absolute = path.resolve(targetPath);
  const relative = path.relative(root, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || relative.includes('\0')
    || !verifyPathContainment(absolute, root).allowed) {
    throw new Error('File target is outside the selected workspace.');
  }
  const boundaries = [root, fs.realpathSync(root)];
  const boundaryIdentities = boundaries.map(boundary => fileIdentity(fs.lstatSync(boundary)));
  let current = absolute;
  // Windows relative() can fold distinct directory names. Inspect the actual
  // source components and prove its root before callers discard that prefix.
  for (;;) {
    const boundary = boundaries.find((candidate, index) => {
      if (current !== candidate && path.relative(candidate, current) !== '') return false;
      try { return fileIdentity(fs.lstatSync(current)) === boundaryIdentities[index]; }
      catch { return false; }
    });
    if (boundary !== undefined) break;
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('File target contains a symlink.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error('File target is outside the selected workspace.');
    current = parent;
  }
  return relative;
}

/** Refuse links in every component, including links that currently stay inside the root. */
export function workspaceFilePath(workspaceRoot: string, relativePath: string): string {
  const root = fs.realpathSync(workspaceRoot);
  const absolute = path.resolve(root, relativePath);
  if (!workspaceRelativePath(root, absolute)) throw new Error('File target is outside the selected workspace.');
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
export function inspectWorkspaceFile(root: string, relative: string, assertFileAccess?: (absolutePath: string) => void, maxBytes?: number,
  admitBytes?: (bytes: number) => void): FileState {
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
    admitBytes?.(opened.size);
    const bytes = admitBytes ? readBounded(fd, opened.size, opened.size)
      : maxBytes === undefined ? fs.readFileSync(fd) : readBounded(fd, maxBytes);
    const content = bytes.toString('utf8');
    if (!Buffer.from(content, 'utf8').equals(bytes)) throw new Error('File target is not UTF-8 text.');
    const final = fs.fstatSync(fd);
    if (opened.size !== final.size || opened.mtimeMs !== final.mtimeMs || opened.ctimeMs !== final.ctimeMs) throw new Error('File changed during inspection.');
    return { state: 'exists', content, hash: hashContent(content), identity: fileIdentity(opened), mode: opened.mode };
  } finally { fs.closeSync(fd); }
}

/** Cancellable counterpart for interactive reads; descriptor identity checks match the sync owner. */
export async function inspectWorkspaceFileAsync(root: string, relative: string, assertFileAccess?: (absolutePath: string) => void,
  maxBytes?: number, admitBytes?: (bytes: number) => void, signal?: AbortSignal): Promise<FileState> {
  signal?.throwIfAborted();
  const absolute = workspaceFilePath(root, relative);
  assertFileAccess?.(absolute);
  signal?.throwIfAborted();
  let stat: fs.Stats;
  try { stat = await fs.promises.lstat(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'absent' };
    throw error;
  }
  if (!stat.isFile()) throw new Error('File target is not a regular file.');
  const handle = await fs.promises.open(absolute,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || fileIdentity(opened) !== fileIdentity(stat)) throw new Error('File target changed identity.');
    const actual = descriptorPath(handle.fd, absolute);
    if (actual !== absolute) {
      assertFileAccess?.(actual);
      throw new Error('File target changed path.');
    }
    assertFileAccess?.(actual);
    signal?.throwIfAborted();
    if (maxBytes !== undefined && opened.size > maxBytes) throw new Error('File exceeds the edit size limit.');
    admitBytes?.(opened.size);
    const bytes = admitBytes ? await readBoundedAsync(handle, opened.size, opened.size, signal)
      : maxBytes === undefined ? await readBoundedAsync(handle, opened.size, opened.size, signal)
        : await readBoundedAsync(handle, maxBytes, undefined, signal);
    const content = bytes.toString('utf8');
    if (!Buffer.from(content, 'utf8').equals(bytes)) throw new Error('File target is not UTF-8 text.');
    const final = await handle.stat();
    if (opened.size !== final.size || opened.mtimeMs !== final.mtimeMs || opened.ctimeMs !== final.ctimeMs) {
      throw new Error('File changed during inspection.');
    }
    return { state: 'exists', content, hash: hashContent(content), identity: fileIdentity(opened), mode: opened.mode };
  } finally { await handle.close(); }
}

function readBounded(fd: number, maxBytes: number, admittedSize?: number): Buffer {
  const bytes = Buffer.alloc(admittedSize ?? Math.min(fs.fstatSync(fd).size + 1, maxBytes + 1));
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
    if (!count) {
      if (admittedSize !== undefined) throw new Error('File changed during inspection.');
      return bytes.subarray(0, offset);
    }
    offset += count;
  }
  if (admittedSize === undefined && (offset > maxBytes || fs.readSync(fd, Buffer.alloc(1), 0, 1, null) > 0)) throw new Error('File exceeds the edit size limit or changed while reading.');
  return bytes;
}

async function readBoundedAsync(handle: FileHandle, maxBytes: number, admittedSize: number | undefined,
  signal?: AbortSignal): Promise<Buffer> {
  const size = admittedSize ?? (await handle.stat()).size;
  const bytes = Buffer.alloc(admittedSize ?? Math.min(size + 1, maxBytes + 1));
  let offset = 0;
  while (offset < bytes.length) {
    signal?.throwIfAborted();
    const count = (await handle.read(bytes, offset, Math.min(64 * 1024, bytes.length - offset), offset)).bytesRead;
    if (!count) {
      if (admittedSize !== undefined) throw new Error('File changed during inspection.');
      return bytes.subarray(0, offset);
    }
    offset += count;
  }
  if (admittedSize === undefined) {
    const extra = Buffer.alloc(1);
    if (offset > maxBytes || (await handle.read(extra, 0, 1, offset)).bytesRead > 0) {
      throw new Error('File exceeds the edit size limit or changed while reading.');
    }
  }
  signal?.throwIfAborted();
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
  const absolute = path.resolve(target);
  pathIdentity(absolute);
  // Keep the original pathname when a checked parent is replaced by a link.
  // Canonicalizing that parent as a new root would authorize its replacement.
  const root = path.parse(absolute).root;
  const state = inspectWorkspaceFile(root, path.relative(root, absolute), undefined, maxBytes);
  return state.state === 'exists' ? state.content : undefined;
}

export async function readTextFileAsync(target: string, maxBytes: number, signal?: AbortSignal): Promise<string | undefined> {
  signal?.throwIfAborted();
  const absolute = path.resolve(target);
  pathIdentity(absolute);
  const root = path.parse(absolute).root;
  const state = await inspectWorkspaceFileAsync(root, path.relative(root, absolute), undefined, maxBytes, undefined, signal);
  return state.state === 'exists' ? state.content : undefined;
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
