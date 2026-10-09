import fs from 'node:fs';
import path from 'node:path';
import { descriptorPath, fileIdentity, workspaceFilePath, type FileState } from '../../core/workspace/files.js';
export { descriptorPath, fileIdentity, inspectWorkspaceFile, workspaceFilePath, type FileState } from '../../core/workspace/files.js';

export type FileExpectation = { readonly state: 'absent' } | {
  readonly state: 'exists';
  readonly hash?: string;
  readonly content?: string;
  readonly identity?: string;
  readonly mode?: number;
};

export function matchesFileState(actual: FileState, expected: FileExpectation): boolean {
  return actual.state === expected.state && (actual.state === 'absent' || (expected.state === 'exists'
    && (expected.hash === undefined || actual.hash === expected.hash)
    && (expected.content === undefined || actual.content === expected.content)
    && (expected.identity === undefined || actual.identity === expected.identity)
    && (expected.mode === undefined || (actual.mode & 0o777) === (expected.mode & 0o777))));
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
