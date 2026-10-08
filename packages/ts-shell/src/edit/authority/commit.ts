import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { descriptorPath, ensureWorkspaceDirectory, fileIdentity, inspectWorkspaceFile, matchesFileState, workspaceFilePath, type FileExpectation, type FileState } from './state.js';

/** Shared file commit for ordinary edits and recovery. The application lock is held by the caller. */
export function commitWorkspaceFile(input: {
  readonly workspaceRoot: string;
  readonly relativePath: string;
  readonly expected: FileExpectation;
  readonly content: string | undefined;
  readonly assertFileAccess?: (absolutePath: string) => void;
}): FileState {
  const root = fs.realpathSync(input.workspaceRoot);
  const absolute = workspaceFilePath(root, input.relativePath);
  input.assertFileAccess?.(absolute);
  const before = inspectWorkspaceFile(root, input.relativePath, input.assertFileAccess);
  if (!matchesFileState(before, input.expected)) throw new Error('File content changed before commit.');
  if (input.content === undefined && before.state === 'absent') return before;
  ensureWorkspaceDirectory(root, path.dirname(input.relativePath));
  const parent = path.dirname(absolute);
  const fd = fs.openSync(parent, fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0));
  const temporaryName = `.edit-${process.pid}-${randomUUID()}`;
  const anchored = process.platform === 'linux' ? `/proc/self/fd/${fd}` : parent;
  const temporary = path.join(anchored, temporaryName);
  let createdTemporary = false;
  try {
    const parentIdentity = fileIdentity(fs.fstatSync(fd));
    if (descriptorPath(fd, parent) !== parent) throw new Error('File parent changed path.');
    if (input.content !== undefined) {
      const temporaryFd = fs.openSync(temporary, 'wx', before.state === 'exists' ? before.mode & 0o777 : 0o666);
      createdTemporary = true;
      try {
        fs.writeFileSync(temporaryFd, input.content, 'utf8');
        if (before.state === 'exists') fs.fchmodSync(temporaryFd, before.mode & 0o777);
        fs.fsyncSync(temporaryFd);
      } finally { fs.closeSync(temporaryFd); }
    }
    // No asynchronous work separates this inspection from publication. The pinned
    // Linux directory also prevents a replaced ancestor from redirecting the write.
    const current = inspectWorkspaceFile(root, input.relativePath, input.assertFileAccess);
    if (!matchesFileState(current, input.expected) || !matchesFileState(current, before)
      || fileIdentity(fs.lstatSync(parent)) !== parentIdentity || descriptorPath(fd, parent) !== parent) {
      throw new Error('File target changed before commit.');
    }
    const destination = path.join(anchored, path.basename(absolute));
    if (input.content === undefined) fs.unlinkSync(destination);
    else if (before.state === 'absent') {
      // link is exclusive; rename would silently overwrite a concurrently created file.
      fs.linkSync(temporary, destination);
      fs.unlinkSync(temporary);
      createdTemporary = false;
    } else {
      fs.renameSync(temporary, destination);
      createdTemporary = false;
    }
    if (process.platform === 'linux') fs.fsyncSync(fd);
    const after = inspectWorkspaceFile(root, input.relativePath, input.assertFileAccess);
    if (!matchesFileState(after, input.content === undefined ? { state: 'absent' } : { state: 'exists', content: input.content })) {
      throw new Error('File commit could not be verified.');
    }
    return after;
  } finally {
    try { if (createdTemporary) fs.unlinkSync(temporary); }
    finally { fs.closeSync(fd); }
  }
}
