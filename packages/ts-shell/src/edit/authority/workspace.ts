import fs from "node:fs";
import path from "node:path";
import { commitWorkspaceFile } from './commit.js';
import { inspectWorkspaceFile, workspaceFilePath } from './state.js';
import { workspaceRelativePath } from '../../core/workspace/files.js';

export type WorkspaceWriteTargetAuthority =
  | {
      readonly ok: true;
      readonly absolutePath: string;
      readonly realPath: string;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "path-outside-workspace"
        | "target-missing"
        | "target-symlink"
        | "target-not-file"
        | "realpath-outside-workspace"
        | "descriptor-outside-workspace"
        | "descriptor-not-file"
        | "filesystem-error";
      readonly message: string;
      readonly evidence: readonly string[];
    };

export type WorkspaceCreateTargetAuthority =
  | {
      readonly ok: true;
      readonly absolutePath: string;
      readonly parentRealPath: string;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "path-outside-workspace"
        | "target-exists"
        | "target-symlink"
        | "parent-missing"
        | "parent-symlink"
        | "parent-not-directory"
        | "parent-realpath-outside-workspace"
        | "filesystem-error";
      readonly message: string;
      readonly evidence: readonly string[];
    };

export interface WorkspaceWriteAuthority {
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly readVerifiedFile: (relativePath: string, assertFileAccess?: (absolutePath: string) => void) => string | undefined;
  readonly directoryExists: (absolutePath: string) => boolean;
  readonly validateWriteTarget: (
    relativePath: string,
  ) => WorkspaceWriteTargetAuthority;
  readonly validateCreateTarget: (
    relativePath: string,
  ) => WorkspaceCreateTargetAuthority;
  readonly writeFile: (relativePath: string, content: string, assertFileAccess?: (absolutePath: string) => void) => void;
  readonly createFileExclusive: (relativePath: string, content: string, assertFileAccess?: (absolutePath: string) => void) => void;
  readonly moveFileExclusive: (sourcePath: string, targetPath: string) => void;
  readonly deleteFile: (relativePath: string) => void;
}

/** Compatibility facade; all file publication delegates to the shared guarded committer. */
export function createWorkspaceWriteAuthority(workspaceRootInput: string): WorkspaceWriteAuthority {
  const root = fs.realpathSync(workspaceRootInput);
  const relative = (absolute: string) => {
    const lexical = path.relative(path.resolve(workspaceRootInput), path.resolve(absolute));
    const selected = lexical === '..' || lexical.startsWith(`..${path.sep}`) || path.isAbsolute(lexical) ? root : workspaceRootInput;
    return workspaceRelativePath(selected, absolute);
  };
  return {
    readFile(absolute) {
      try {
        const state = inspectWorkspaceFile(root, relative(absolute));
        return state.state === 'exists' ? state.content : undefined;
      } catch { return undefined; }
    },
    readVerifiedFile(relativePath, assertFileAccess) {
      const state = inspectWorkspaceFile(root, relativePath, assertFileAccess);
      return state.state === 'exists' ? state.content : undefined;
    },
    directoryExists(absolute) {
      try {
        const target = path.dirname(workspaceFilePath(root, path.join(relative(absolute), '.directory-check')));
        return fs.lstatSync(target).isDirectory();
      } catch { return false; }
    },
    validateWriteTarget(relativePath) { return writeTarget(root, relativePath); },
    validateCreateTarget(relativePath) { return createTarget(root, relativePath); },
    writeFile(relativePath, content, assertFileAccess) {
      commitWorkspaceFile({ workspaceRoot: root, relativePath, content, expected: { state: 'exists' }, assertFileAccess });
    },
    createFileExclusive(relativePath, content, assertFileAccess) {
      commitWorkspaceFile({ workspaceRoot: root, relativePath, content, expected: { state: 'absent' }, assertFileAccess });
    },
    deleteFile(relativePath) {
      commitWorkspaceFile({ workspaceRoot: root, relativePath, content: undefined, expected: { state: 'exists' } });
    },
    moveFileExclusive(sourcePath, targetPath) {
      const source = writeTarget(root, sourcePath);
      const target = createTarget(root, targetPath);
      if (!source.ok) throw new Error(source.message);
      if (!target.ok) throw new Error(target.message);
      const expected = inspectWorkspaceFile(root, sourcePath);
      fs.linkSync(source.absolutePath, target.absolutePath);
      // Keep legacy partial-move behavior visible; operation batches own compensation.
      commitWorkspaceFile({ workspaceRoot: root, relativePath: sourcePath, expected, content: undefined });
    },
  };
}

function writeTarget(root: string, relative: string): WorkspaceWriteTargetAuthority {
  try {
    const absolutePath = workspaceFilePath(root, relative);
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile()) return writeFailure('target-not-file');
    return { ok: true, absolutePath, realPath: fs.realpathSync(absolutePath) };
  } catch (error) {
    return writeFailure((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'target-missing'
      : error instanceof Error && error.message.includes('symlink') ? 'target-symlink'
        : error instanceof Error && error.message.includes('outside') ? 'path-outside-workspace' : 'filesystem-error');
  }
}

function createTarget(root: string, relative: string): WorkspaceCreateTargetAuthority {
  try {
    const absolutePath = workspaceFilePath(root, relative);
    try { fs.lstatSync(absolutePath); return createFailure('target-exists'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = path.dirname(absolutePath);
    if (!fs.lstatSync(parent).isDirectory()) return createFailure('parent-not-directory');
    return { ok: true, absolutePath, parentRealPath: fs.realpathSync(parent) };
  } catch (error) {
    return createFailure((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'parent-missing'
      : error instanceof Error && error.message.includes('symlink') ? 'target-symlink'
        : error instanceof Error && error.message.includes('outside') ? 'path-outside-workspace' : 'filesystem-error');
  }
}

function writeFailure(reason: Extract<WorkspaceWriteTargetAuthority, { ok: false }>['reason']): Extract<WorkspaceWriteTargetAuthority, { ok: false }> {
  return { ok: false, reason, message: `Workspace write refused: ${reason}.`, evidence: ['apply-patch-workspace-authority:blocked', `apply-patch-workspace-authority:${reason}`] };
}

function createFailure(reason: Extract<WorkspaceCreateTargetAuthority, { ok: false }>['reason']): Extract<WorkspaceCreateTargetAuthority, { ok: false }> {
  return { ok: false, reason, message: `Workspace creation refused: ${reason}.`, evidence: ['apply-patch-workspace-create-authority:blocked', `apply-patch-workspace-create-authority:${reason}`] };
}
