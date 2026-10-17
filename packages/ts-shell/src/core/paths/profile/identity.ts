import fs from 'node:fs';
import path from 'node:path';

export interface DirectoryIdentity {
  readonly path: string;
  readonly identity: string;
}

/** Check each existing component, including ancestors of a missing target. */
export function assertUnlinkedPath(target: string): void {
  const absolute = path.resolve(target);
  let current = path.parse(absolute).root;
  for (const part of path.relative(current, absolute).split(path.sep)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Profile storage cannot contain symbolic links.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

export function directoryIdentity(target: string): DirectoryIdentity {
  const stat = fs.statSync(target, { bigint: true });
  if (!stat.isDirectory()) throw new Error('Profile storage must be a directory.');
  return Object.freeze({ path: target, identity: `${stat.dev}:${stat.ino}:${stat.birthtimeNs}` });
}

export function assertDirectoryIdentity(expected: DirectoryIdentity): void {
  try {
    if (fs.realpathSync(expected.path) !== expected.path || directoryIdentity(expected.path).identity !== expected.identity) {
      throw new Error();
    }
  } catch {
    throw new Error('Profile storage changed identity. Restart before accessing profile state.');
  }
}

export function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
